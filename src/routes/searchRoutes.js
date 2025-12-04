const express = require("express");
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  searchValidationRules,
  messangerSearchValidationRules,
} = require("../validators/searchValidators");
const { search, messangerSearch } = require("../controllers/searchController");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Search endpoints
 */


/**
 * @swagger
 * /search:
 *   get:
 *     summary: Search for users or posts
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term for users or posts
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ALL, USERS, POSTS]
 *         description: Type of search (ALL, USERS, or POSTS)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: Search results with users and posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: integer
 *                         example: 1
 *                       username:
 *                         type: string
 *                         example: john_doe
 *                       profilePicture:
 *                         type: string
 *                         nullable: true
 *                         example: https://example.com/john.jpg
 *                       bio:
 *                         type: string
 *                         nullable: true
 *                         example: I love coding!
 *                       isPrivate:
 *                         type: boolean
 *                         example: false
 *                       isFollowed:
 *                         type: string
 *                         enum: [true, false, "pending"]
 *                         description: |
 *                           Follow status:
 *                           - `true`: User is followed (ACCEPTED)
 *                           - `false`: Not followed
 *                           - `"pending"`: Follow request is pending
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/", authMiddleware, searchValidationRules, search);


/**
 * @swagger
 * /search/messanger:
 *   get:
 *     summary: Search for users or messages in the messenger
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term for users or messages
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [USER, MESSAGE]
 *         description: Type of search (USER or MESSAGE)
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       UserID:
 *                         type: integer
 *                         example: 1
 *                       Username:
 *                         type: string
 *                         example: john_doe
 *                       ProfilePicture:
 *                         type: string
 *                         example: https://example.com/john.jpg
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       content:
 *                         type: string
 *                         example: Hello, how are you?
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-04-19T13:00:00.000Z
 *                       isReaded:
 *                         type: boolean
 *                         example: true
 *                       conversationId:
 *                         type: string
 *                         example: conv_123
 *                       otherUser:
 *                         type: object
 *                         properties:
 *                           UserID:
 *                             type: integer
 *                             example: 2
 *                           Username:
 *                             type: string
 *                             example: jane_doe
 *                           ProfilePicture:
 *                             type: string
 *                             example: https://example.com/jane.jpg
 *                 message:
 *                   type: string
 *                   example: No results found for your search.
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/messanger",
  authMiddleware,
  messangerSearchValidationRules,
  messangerSearch
);

module.exports = router;
