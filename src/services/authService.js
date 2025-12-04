const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const prisma = require("../utils/prisma");
const redis = require("../utils/redis");

/**
 * Generates access and refresh tokens for a user.
 * @param {Object} user - User object with UserID
 * @returns {Object} Object containing accessToken and refreshToken
 */
const generateTokens = (user) => {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error("JWT secrets not configured");
  }

  const accessToken = jwt.sign(
    { userId: user.UserID },
    process.env.JWT_SECRET,
    { expiresIn: "15m", issuer: "linkup-api" }
  );

  const refreshToken = jwt.sign(
    { userId: user.UserID },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d", issuer: "linkup-api" }
  );

  return { accessToken, refreshToken };
};

/**
 * Registers a new user with hashed password.
 * @param {Object} params - Object containing profileName, username, email, password, gender, and dateOfBirth
 * @returns {Object} Created user object and tokens
 */
const register = async ({
  profileName,
  username,
  email,
  password,
  gender,
  dateOfBirth,
}) => {
  try {
    // Normalize dateOfBirth to UTC midnight to avoid timezone issues
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      throw new Error("Invalid date of birth format");
    }
    const normalizedDate = new Date(
      Date.UTC(dob.getFullYear(), dob.getMonth(), dob.getDate())
    );

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        ProfileName: profileName,
        Username: username,
        Email: email,
        Password: hashedPassword,
        Gender: gender,
        DateOfBirth: normalizedDate,
        Role: "USER",
        ProfilePicture: null,
      },
      select: {
        UserID: true,
        Username: true,
        Email: true,
        ProfileName: true,
        ProfilePicture: true,
      },
    });

    const { accessToken, refreshToken } = generateTokens(user);

    await redis.set(
      `refresh_token:${user.UserID}`,
      refreshToken,
      7 * 24 * 60 * 60
    );

    return { user, tokens: { accessToken, refreshToken } };
  } catch (error) {
    console.error("Register error:", error.message);
    if (error.code === "P2002") {
      throw new Error("Email or username already exists");
    }
    throw new Error(`Registration failed: ${error.message}`);
  }
};

/**
 * Authenticates a user and stores refresh token in Redis.
 * @param {string} usernameOrEmail - Username or email of the user
 * @param {string} password - User's password
 * @returns {Object} Object containing user and tokens
 */
const login = async (usernameOrEmail, password) => {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { Username: usernameOrEmail },
        { Email: { equals: usernameOrEmail, mode: "insensitive" } },
      ],
    },
    select: {
      UserID: true,
      Username: true,
      Email: true,
      ProfileName: true,
      ProfilePicture: true,
      Password: true,
    },
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  const isPasswordValid = await bcrypt.compare(password, user.Password);
  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  const { accessToken, refreshToken } = generateTokens(user);

  await redis.set(
    `refresh_token:${user.UserID}`,
    refreshToken,
    7 * 24 * 60 * 60
  );

  return {
    user: {
      UserID: user.UserID,
      Username: user.Username,
      Email: user.Email,
      ProfileName: user.ProfileName,
      ProfilePicture: user.ProfilePicture,
    },
    tokens: { accessToken, refreshToken },
  };
};

/**
 * Refreshes access and refresh tokens using a valid refresh token.
 * @param {string} refreshToken - The refresh token
 * @returns {Object} Object containing user data and new tokens
 * @throws {Error} If the refresh token is invalid or user is not found/banned
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    if (!refreshToken) {
      throw new Error("No refresh token provided");
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if refresh token exists in Redis
    const storedToken = await redis.get(`refresh_token:${decoded.userId}`);
    // if (!storedToken || storedToken !== refreshToken) {
    //   throw new Error("Invalid or expired refresh token");
    // }

    console.log(">> Incoming refreshToken from cookie:", refreshToken);
    console.log(">> Stored refreshToken in Redis:", storedToken);
    console.log(">> Are they equal?", storedToken === refreshToken);


    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { UserID: decoded.userId },
      select: {
        UserID: true,
        Username: true,
        ProfileName: true,
        ProfilePicture: true,
        Email: true,
        IsBanned: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.IsBanned) {
      throw new Error("User is banned");
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Store new refresh token in Redis, replacing the old one
    await redis.set(
      `refresh_token:${user.UserID}`,
      newRefreshToken,
      7 * 24 * 60 * 60
    );

    return {
      user: {
        UserID: user.UserID,
        Username: user.Username,
        ProfileName: user.ProfileName,
        ProfilePicture: user.ProfilePicture,
        Email: user.Email,
      },
      tokens: { accessToken, refreshToken: newRefreshToken },
    };
  } catch (error) {
    console.error("Refresh token error:", error);
    throw error;
  }
};

/**
 * Removes a user's refresh token from Redis and blacklists access token.
 * @param {number} userId - ID of the user to logout
 * @param {string} accessToken - Access token to blacklist
 */
const logout = async (userId, accessToken) => {
  try {
    await redis.del(`refresh_token:${userId}`);
    if (accessToken) {
      await redis.set(`blacklist:access:${accessToken}`, "1", 15 * 60); // Blacklist for 15 minutes
    }
    console.log(
      `Deleted refresh_token:${userId} and blacklisted accessToken from Redis`
    );
  } catch (error) {
    console.error("Logout error:", error.message);
    throw new Error(`Logout failed: ${error.message}`);
  }
};

module.exports = { register, login, refreshAccessToken, logout };
