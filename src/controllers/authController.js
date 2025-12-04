const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const prisma = require("../utils/prisma");
const redis = require("../utils/redis");
const { sendResetEmail } = require("../services/emailService");
const {
  register,
  login: serviceLogin,
  logout: serviceLogout,
  refreshAccessToken,
} = require("../services/authService");

const SALT_ROUNDS = 10; // Define salt rounds

// Cookie options for security
const getCookieOptions = (isRefresh = false) => ({
  httpOnly: true, // Prevents client-side JS from accessing the cookie
  secure: process.env.NODE_ENV === "production", // Use secure cookies in production (HTTPS)
  sameSite: "Strict", // Protects against CSRF attacks
  maxAge: isRefresh ? 7 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000, // 7 days for refresh, 15 mins for access
  path: "/", // Available site-wide
});

/**
 * Handles user registration with email/username availability check
 * and password hashing. Sets tokens as secure cookies.
 */
const signup = async (req, res) => {
  console.log("Signup request received:", {
    profileName: req.body.profileName,
    username: req.body.username,
    email: req.body.email,
    gender: req.body.gender,
    dateOfBirth: req.body.dateOfBirth,
  });

  const { profileName, username, email, password, gender, dateOfBirth } =
    req.body;

  try {
    // Register the user using authService
    const { user: newUser, tokens } = await register({
      profileName,
      username,
      email: email.toLowerCase(),
      password,
      gender,
      dateOfBirth,
    });

    if (!newUser || !tokens) {
      throw new Error("Registration failed: Invalid response from register");
    }

    // Create welcome notification
    await prisma.notification.create({
      data: {
        UserID: newUser.UserID,
        Type: "WELCOME",
        Content: `Welcome to LinkUp, ${username}! Start exploring and connecting!`,
        Metadata: { signupDate: new Date().toISOString() },
      },
    });
    console.log("User created:", {
      UserID: newUser.UserID,
      Username: newUser.Username,
    });

    // Set secure cookies for tokens
    res.cookie("accessToken", tokens.accessToken, getCookieOptions());
    res.cookie("refreshToken", tokens.refreshToken, getCookieOptions(true));

    res.status(201).json({
      message: "User registered successfully",
      data: {
        userId: newUser.UserID,
        username: newUser.Username,
        profileName: newUser.ProfileName,
        profilePicture: newUser.ProfilePicture,
        email: newUser.Email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    if (error.message.includes("Registration failed")) {
      return res.status(400).json({
        message: "Invalid registration data",
        errors: [{ msg: error.message }],
      });
    }
    if (error.message.includes("Email or username already exists")) {
      return res.status(409).json({
        message: "Email or username already exists",
      });
    }
    res.status(500).json({
      message: "Error registering user",
      error: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

/**
 * Authenticates user and sets JWT tokens as secure cookies.
 * Uses constant-time comparison to prevent timing attacks.
 */
const login = async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  try {
    console.log("Login attempt for:", usernameOrEmail);
    if (!usernameOrEmail || !password) {
      return res
        .status(400)
        .json({ message: "Username/email and password required" });
    }

    const { user, tokens } = await serviceLogin(usernameOrEmail, password);

    // Set secure cookies for tokens
    res.cookie("accessToken", tokens.accessToken, getCookieOptions());
    res.cookie("refreshToken", tokens.refreshToken, getCookieOptions(true));

    res.json({
      message: "Login successful",
      data: {
        userId: user.UserID,
        username: user.Username,
        profileName: user.ProfileName,
        profilePicture: user.ProfilePicture,
        email: user.Email,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    if (error.message.includes("Invalid credentials")) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (error.message.includes("redis.set")) {
      return res.status(503).json({ message: "Failed to store refresh token" });
    }
    res.status(500).json({
      message: "Authentication failed",
      error: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

/**
 * Refreshes access token using a valid refresh token from cookies.
 */
const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string") {
      return res.status(400).json({ error: "Valid refresh token required" });
    }

    console.log("Attempting token refresh for user");
    const { user, tokens } = await refreshAccessToken(refreshToken);

    // Set new secure cookies
    res.cookie("accessToken", tokens.accessToken, getCookieOptions());
    res.cookie("refreshToken", tokens.refreshToken, getCookieOptions(true));

    res.json({
      message: "Token refreshed successfully",
      data: {
        userId: user.UserID,
        username: user.Username,
        profileName: user.ProfileName,
        profilePicture: user.ProfilePicture,
        email: user.Email,
      },
    });
  } catch (error) {
    console.error("refreshToken error:", error.message);
    if (error.message.includes("Invalid or expired refresh token")) {
      return res
        .status(401)
        .json({ error: "Invalid or expired refresh token" });
    }
    if (error.message.includes("User not found")) {
      return res.status(404).json({ error: "User not found" });
    }
    if (error.message.includes("User is banned")) {
      return res.status(403).json({ error: "User is banned" });
    }
    res.status(500).json({ error: "Failed to refresh token" });
  }
};

/**
 * Initiates password reset flow by sending a 4-digit verification code.
 */
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  console.log(req.body);

  try {
    const user = await prisma.user.findUnique({ where: { Email: email } });
    let codeSent = false;

    if (user) {
      // Generate a 4-digit verification code
      const verificationCode = Math.floor(
        1000 + Math.random() * 9000
      ).toString();
      const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

      // Store the code in resetToken field
      await prisma.user.update({
        where: { UserID: user.UserID },
        data: { resetToken: verificationCode, resetTokenExpiry },
      });

      // Send the verification code via email
      await sendResetEmail(email, verificationCode, true); // true indicates it's a code, not a link
      codeSent = true;
    }

    // Generic response to prevent email enumeration, but include codeSent for UI
    res.status(200).json({
      message: "If the email exists, a verification code has been sent",
      codeSent,
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ message: "Error processing request" });
  }
};

/**
 * Verifies the 4-digit verification code and returns a temporary token.
 */
const verifyCode = async (req, res) => {
  const { code, email } = req.body;

  try {
    // Find user with valid, non-expired verification code
    const user = await prisma.user.findFirst({
      where: {
        Email: email,
        resetToken: code,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification code" });
    }

    // Generate a temporary token for password reset (valid for 5 minutes)
    const resetToken = jwt.sign(
      { userId: user.UserID },
      process.env.JWT_SECRET,
      { expiresIn: "5m", issuer: "linkup-api" }
    );

    // Store the temporary token in Redis
    await redis.set(
      `reset_token:${user.UserID}`,
      resetToken,
      5 * 60 // 5 minutes expiry
    );

    // Set resetToken in a secure cookie
    res.cookie("resetToken", resetToken, getCookieOptions(false, true));

    // Clear the verification code
    await prisma.user.update({
      where: { UserID: user.UserID },
      data: { resetToken: null, resetTokenExpiry: null },
    });

    res.status(200).json({
      message: "Code verified successfully",
    });
  } catch (error) {
    console.error("Code verification error:", error);
    res.status(500).json({ message: "Error verifying code" });
  }
};

/**
 * Completes password reset flow using a temporary token.
 */
const resetPassword = async (req, res) => {
  const { newPassword } = req.body;
  const resetToken = req.cookies.resetToken; // Read from cookie

  try {
    if (!resetToken) {
      return res
        .status(400)
        .json({ message: "Reset token not provided in cookies" });
    }

    // Verify the temporary token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.message);
      return res
        .status(401)
        .json({ message: "Invalid or expired reset token" });
    }

    const userId = decoded.userId;
    const storedToken = await redis.get(`reset_token:${userId}`);

    if (!storedToken || storedToken !== resetToken) {
      return res
        .status(401)
        .json({ message: "Invalid or expired reset token" });
    }

    // Validate new password
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters long" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await prisma.user.update({
      where: { UserID: userId },
      data: {
        Password: hashedPassword,
      },
    });

    // Clear the temporary token from Redis and cookie
    await redis.del(`reset_token:${userId}`);
    res.clearCookie("resetToken", { path: "/" });

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Password update error:", error);
    res.status(500).json({ message: "Error updating password" });
  }
};

/**
 * Logs out the user by clearing cookies and removing refresh token from Redis.
 */
const logout = async (req, res) => {
  try {
    const userId = req.user.UserID; // From authMiddleware
    const accessToken = req.cookies.accessToken; // Get accessToken from cookies
    await serviceLogout(userId, accessToken);

    // Clear all cookies
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/" });
    res.clearCookie("resetToken", { path: "/" }); // Clear resetToken if exists

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Failed to logout" });
  }
};

/**
 * Checks if the user is authenticated based on the access token in cookies.
 * Returns user data if authenticated, or indicates refresh needed if token is invalid/expired.
 */
const isAuthenticated = async (req, res) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) {
      return res.status(401).json({
        isAuthenticated: false,
        message: "No access token provided",
      });
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:access:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        isAuthenticated: false,
        message: "Token is blacklisted, please login again",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Access token verified for user ID:", decoded.userId);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.message);
      return res.status(401).json({
        isAuthenticated: false,
        message: "Token expired or invalid, please refresh token",
      });
    }

    const user = await prisma.user.findUnique({
      where: { UserID: decoded.userId },
      select: {
        UserID: true,
        Username: true,
        ProfileName: true,
        ProfilePicture: true,
        Email: true,
        IsPrivate: true,
        IsBanned: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        isAuthenticated: false,
        message: "User not found",
      });
    }

    if (user.IsBanned) {
      return res.status(403).json({
        isAuthenticated: false,
        message: "User is banned",
      });
    }

    res.json({
      isAuthenticated: true,
      message: "User is authenticated",
      data: {
        userId: user.UserID,
        username: user.Username,
        profileName: user.ProfileName,
        profilePicture: user.ProfilePicture,
        email: user.Email,
        isPrivate: user.IsPrivate,
      },
    });
  } catch (error) {
    console.error("isAuthenticated error:", error.message);
    res.status(500).json({
      isAuthenticated: false,
      message: "Failed to check authentication status",
    });
  }
};

module.exports = {
  signup,
  login,
  refreshToken,
  forgotPassword,
  verifyCode,
  resetPassword,
  logout,
  isAuthenticated,
};
