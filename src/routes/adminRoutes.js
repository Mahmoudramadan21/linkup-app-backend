const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { validate } = require("../middleware/validationMiddleware");
const { authMiddleware, authorize } = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ReportedPost:
 *       type: object
 *       properties:
 *         postId:
 *           type: integer
 *         content:
 *           type: string
 *         reportCount:
 *           type: integer
 *         reporterUsernames:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         owner:
 *           type: string
 *     UserDetails:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *         username:
 *           type: string
 *         email:
 *           type: string
 *         role:
 *           type: string
 *           enum: [USER, ADMIN, BANNED]
 *         isBanned:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         postCount:
 *           type: integer
 *         filedReportCount:
 *           type: integer
 *         reportedPostCount:
 *           type: integer
 *     AdminAction:
 *       type: object
 *       properties:
 *         actionType:
 *           type: string
 *           enum: [DELETE_POST, WARN_USER, BAN_USER, DISMISS_REPORT]
 *         postId:
 *           type: integer
 *         userId:
 *           type: integer
 *         reason:
 *           type: string
 *     UpdateUser:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *         role:
 *           type: string
 *           enum: [USER, ADMIN, BANNED]
 *         isBanned:
 *           type: boolean
 *         reason:
 *           type: string
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserAuth:
 *       type: object
 *       required:
 *         - username
 *         - email
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           minLength: 3
 *           maxLength: 20
 *           pattern: '^[a-zA-Z0-9_]+$'
 *           example: john_doe
 *         email:
 *           type: string
 *           format: email
 *           example: john@example.com
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: P@ssw0rd123
 *     LoginCredentials:
 *       type: object
 *       required:
 *         - usernameOrEmail
 *         - password
 *       properties:
 *         usernameOrEmail:
 *           type: string
 *           example: john_doe
 *         password:
 *           type: string
 *           format: password
 *           example: P@ssw0rd123
 *     PasswordResetRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: john@example.com
 *     PasswordReset:
 *       type: object
 *       required:
 *         - token
 *         - newPassword
 *       properties:
 *         token:
 *           type: string
 *           example: abc123def456
 *         newPassword:
 *           type: string
 *           format: password
 *           example: NewP@ssw0rd123
 *   responses:
 *     UserResponse:
 *       description: User registration response
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 example: User registered successfully
 *               userId:
 *                 type: integer
 *                 example: 1
 *     LoginResponse:
 *       description: Successful login response
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 example: Login successful
 *               token:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     PasswordResetResponse:
 *       description: Password reset response
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 example: Password reset link has been sent
 */

/**
 * @swagger
 * /admin/reports:
 *   get:
 *     summary: Get all reported posts
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, RESOLVED, DISMISSED]
 *           default: PENDING
 *         description: Status filter for reports
 *     responses:
 *       200:
 *         description: List of reported posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ReportedPost'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       400:
 *         description: Invalid status value
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (not an admin)
 */
router.get(
  "/reports",
  authMiddleware,
  authorize("ADMIN"),
  adminController.getReportedPosts
);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           default: ""
 *         description: Search term for username or email
 *     responses:
 *       200:
 *         description: List of all users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserDetails'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (not an admin)
 */
router.get(
  "/users",
  authMiddleware,
  authorize("ADMIN"),
  adminController.getAllUsers
);

/**
 * @swagger
 * /admin/users/{userId}:
 *   get:
 *     summary: Get user details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to retrieve
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/UserDetails'
 *       400:
 *         description: Invalid user ID
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (not an admin)
 *       404:
 *         description: User not found
 */
router.get(
  "/users/:userId",
  authMiddleware,
  authorize("ADMIN"),
  adminController.getUserDetails
);

/**
 * @swagger
 * /admin/users/{userId}:
 *   put:
 *     summary: Update user role or ban status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUser'
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 auditLogId:
 *                   type: integer
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (not an admin)
 *       404:
 *         description: User not found
 */
router.put(
  "/users/:userId",
  authMiddleware,
  authorize("ADMIN"),
  validate,
  adminController.updateUser
);

/**
 * @swagger
 * /admin/actions:
 *   post:
 *     summary: Take admin action
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminAction'
 *     responses:
 *       200:
 *         description: Action completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 auditLogId:
 *                   type: integer
 *       400:
 *         description: Invalid action request
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (not an admin)
 *       404:
 *         description: Target not found (user/post)
 */
router.post(
  "/actions",
  authMiddleware,
  authorize("ADMIN"),
  validate,
  adminController.takeAction
);

module.exports = router;
