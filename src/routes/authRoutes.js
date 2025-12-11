/**
 * Authentication routes for the LinkUp backend.
 * @module routes/authRoutes
 */

const express = require("express");
const {
  signup,
  login,
  refreshToken: controllerRefreshToken,
  forgotPassword,
  verifyCode,
  resetPassword,
  logout,
  isAuthenticated,
} = require("../controllers/authController");
const {
  signupValidationRules,
  loginValidationRules,
  forgotPasswordValidationRules,
  verifyCodeValidationRules,
  resetPasswordValidationRules,
} = require("../validators/authValidators");
const { validate } = require("../middleware/validationMiddleware");
const { authMiddleware } = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");

const router = express.Router();

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 15, // Limit to 5 attempts
  message: "Too many login attempts, please try again after 5 minutes",
});

// Rate limiter for forgot-password endpoint
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 attempts
  message:
    "Too many password reset requests, please try again after 15 minutes",
});

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: APIs for user authentication and account management
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     cookieAuth:
 *       type: apiKey
 *       in: cookie
 *       name: accessToken
 *       description: JWT access token stored in a secure, httpOnly cookie
 *     csrfToken:
 *       type: apiKey
 *       in: header
 *       name: X-CSRF-Token
 *       description: CSRF token required for POST requests
 *   schemas:
 *     UserAuth:
 *       type: object
 *       required:
 *         - profileName
 *         - username
 *         - email
 *         - password
 *         - gender
 *         - dateOfBirth
 *       properties:
 *         profileName:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *           pattern: '^[a-zA-Z\s]+$'
 *           example: John Doe
 *           description: User's full name (letters and spaces only)
 *         username:
 *           type: string
 *           minLength: 3
 *           maxLength: 20
 *           pattern: '^[a-zA-Z0-9_]+$'
 *           example: john_doe
 *           description: Unique username (alphanumeric and underscores only)
 *         email:
 *           type: string
 *           format: email
 *           example: john@example.com
 *           description: Valid email address
 *         password:
 *           type: string
 *           minLength: 8
 *           example: P@ssw0rd123
 *           description: Password with minimum 8 characters, including one uppercase, one lowercase, one number, and one special character
 *         gender:
 *           type: string
 *           enum: [MALE, FEMALE, OTHER]
 *           example: MALE
 *           description: User's gender
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           example: 1990-01-01
 *           description: Date of birth in ISO 8601 format (YYYY-MM-DD)
 *     LoginCredentials:
 *       type: object
 *       required:
 *         - usernameOrEmail
 *         - password
 *       properties:
 *         usernameOrEmail:
 *           type: string
 *           example: john_doe
 *           description: Username or email address
 *         password:
 *           type: string
 *           minLength: 8
 *           example: P@ssw0rd123
 *           description: User password
 *     PasswordResetRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: john@example.com
 *           description: Email address associated with the account
 *     VerifyCodeRequest:
 *       type: object
 *       required:
 *         - email
 *         - code
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: john@example.com
 *           description: Email address associated with the account
 *         code:
 *           type: string
 *           pattern: '^[0-9]{4}$'
 *           example: "1234"
 *           description: 4-digit verification code received via email
 *     PasswordResetWithToken:
 *       type: object
 *       required:
 *         - resetToken
 *         - newPassword
 *       properties:
 *         resetToken:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *           description: Temporary token received after code verification
 *         newPassword:
 *           type: string
 *           minLength: 8
 *           example: NewP@ssw0rd123
 *           description: New password with minimum 8 characters, including one uppercase, one lowercase, one number, and one special character
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: Success message
 *         codeSent:
 *           type: boolean
 *           description: Indicates if a code was sent (optional)
 *         resetToken:
 *           type: string
 *           description: Temporary token for password reset (optional)
 *         isAuthenticated:
 *           type: boolean
 *           description: Indicates if the user is authenticated (optional)
 *         data:
 *           type: object
 *           description: Additional data (optional)
 *       example:
 *         message: Operation successful
 *         data: {}
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: Error message
 *         error:
 *           type: string
 *           description: Detailed error description (optional, development only)
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               error:
 *                 type: string
 *           description: Validation errors (optional)
 *       example:
 *         message: Validation failed
 *         errors:
 *           - field: email
 *             error: Invalid email format
 */

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user account
 *     tags: [Authentication]
 *     security:
 *       - csrfToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserAuth'
 *     responses:
 *       201:
 *         description: User registered successfully, tokens set in secure cookies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     profileName:
 *                       type: string
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                     email:
 *                       type: string
 *             example:
 *               message: User registered successfully
 *               data:
 *                 userId: 1
 *                 username: john_doe
 *                 profileName: John Doe
 *                 profilePicture: null
 *                 email: john.doe@example.com
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Max-Age=900
 *             description: Sets accessToken and refreshToken in secure cookies
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid registration data
 *               errors:
 *                 - field: profilename
 *                   error: Profile name is required
 *       403:
 *         description: Invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid CSRF token
 *       409:
 *         description: Email or username already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Email or username already exists
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Error registering user
 */
router.post("/signup", signupValidationRules, validate, signup);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user and set tokens in cookies
 *     tags: [Authentication]
 *     security:
 *       - csrfToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginCredentials'
 *     responses:
 *       200:
 *         description: Login successful, tokens set in secure cookies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     profileName:
 *                       type: string
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                     email:
 *                       type: string
 *             example:
 *               message: Login successful
 *               data:
 *                 userId: 1
 *                 username: john_doe
 *                 profileName: John Doe
 *                 profilePicture: https://res.cloudinary.com/duw4x8iqq/image/upload/s57dsggdf/profile_pictures/user_profile.jpg
 *                 email: john.doe@example.com
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Max-Age=900
 *             description: Sets accessToken and refreshToken in secure cookies
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Username or email is required
 *               errors:
 *                 - field: usernameOrEmail
 *                   error: Username or email is required
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid credentials
 *       403:
 *         description: Invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid CSRF token
 *       429:
 *         description: Too many login attempts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Too many login attempts, please try again after 15 minutes
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Authentication failed
 */
router.post(
  "/login",
  loginLimiter,
  loginValidationRules,
  validate,
  login
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token from cookies
 *     tags: [Authentication]
 *     security:
 *       - csrfToken: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully, new tokens set in cookies
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               message: Token refreshed successfully
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Max-Age=900
 *             description: Sets new accessToken and refreshToken in secure cookies
 *       400:
 *         description: Invalid or missing refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Valid refresh token required
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid or expired refresh token
 *       403:
 *         description: User is banned or invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: User is banned
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: User not found
 *       503:
 *         description: Service unavailable (Redis or database)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Redis service unavailable
 */
router.post("/refresh", controllerRefreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Log out user and clear tokens
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *       - csrfToken: []
 *     responses:
 *       200:
 *         description: Logout successful, cookies cleared
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               message: Logout successful
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: accessToken=; Max-Age=0; HttpOnly; Secure; SameSite=Strict
 *             description: Clears accessToken and refreshToken cookies
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Authentication failed
 *       403:
 *         description: Invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid CSRF token
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Failed to logout
 */
router.post("/logout", authMiddleware, logout);

/**
 * @swagger
 * /auth/isAuthenticated:
 *   get:
 *     summary: Check if user is authenticated based on access token in cookies
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User is authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isAuthenticated:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     profileName:
 *                       type: string
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                     email:
 *                       type: string
 *             example:
 *               isAuthenticated: true
 *               message: User is authenticated
 *               data:
 *                 userId: 1
 *                 username: john_doe
 *                 profileName: John Doe
 *                 profilePicture: https://res.cloudinary.com/duw4x8iqq/image/upload/s57dsggdf/profile_pictures/user_profile.jpg
 *                 email: john.doe@example.com
 *       401:
 *         description: Unauthorized (invalid, expired, or missing token)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               isAuthenticated: false
 *               message: Token expired or invalid, please refresh token
 *       403:
 *         description: User is banned or token is blacklisted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               isAuthenticated: false
 *               message: User is banned
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               isAuthenticated: false
 *               message: User not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               isAuthenticated: false
 *               message: Failed to check authentication status
 */
router.get("/isAuthenticated", isAuthenticated);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset verification code
 *     tags: [Authentication]
 *     security:
 *       - csrfToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetRequest'
 *     responses:
 *       200:
 *         description: Verification code sent (or queued) if account exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               message: If the email exists, a verification code has been sent
 *               codeSent: true
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Email is required
 *               errors:
 *                 - field: email
 *                   error: Email is required
 *       403:
 *         description: Invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid CSRF token
 *       429:
 *         description: Too many password reset requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Too many password reset requests, please try again after 15 minutes
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Error processing request
 */
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  forgotPasswordValidationRules,
  validate,
  forgotPassword
);

/**
 * @swagger
 * /auth/verify-code:
 *   post:
 *     summary: Verify the 4-digit verification code
 *     tags: [Authentication]
 *     security:
 *       - csrfToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyCodeRequest'
 *     responses:
 *       200:
 *         description: Code verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               message: Code verified successfully
 *               resetToken: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Invalid or expired verification code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid or expired verification code
 *       403:
 *         description: Invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid CSRF token
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Error verifying code
 */
router.post(
  "/verify-code",
  verifyCodeValidationRules,
  validate,
  verifyCode
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset user password using a temporary token
 *     tags: [Authentication]
 *     security:
 *       - csrfToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetWithToken'
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               message: Password updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: New password must be at least 8 characters long
 *       401:
 *         description: Invalid or expired reset token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid or expired reset token
 *       403:
 *         description: Invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Invalid CSRF token
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Error updating password
 */
router.post(
  "/reset-password",
  resetPasswordValidationRules,
  validate,
  resetPassword
);

/**
 * @swagger
 * /auth/csrf-token:
 *   get:
 *     summary: Fetch a new CSRF token
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: CSRF token set in cookies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: CSRF token generated successfully
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: csrf-token=abc123; Secure; SameSite=Strict
 *             description: Sets a non-HttpOnly CSRF token cookie for frontend access
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Failed to generate CSRF token
 */
// router.get("/csrf-token", csrfProtection, setCsrfCookie, (req, res) => {
//   res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
//   res.status(200).json({ message: "CSRF token generated successfully" });
// });

module.exports = router;
