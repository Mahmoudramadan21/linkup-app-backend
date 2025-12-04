const {
  createHighlight,
  getUserHighlights,
  getUserHighlightById,
  updateHighlight,
  deleteHighlight,
} = require("../controllers/highlightController");
const { authMiddleware } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
  validateHighlightInput,
  validateHighlightUpdate,
} = require("../validators/highlightValidators");
const express = require("express");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Highlights
 *   description: Story highlights management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Highlight:
 *       type: object
 *       properties:
 *         highlightId:
 *           type: integer
 *           description: Unique identifier for the highlight
 *         title:
 *           type: string
 *           description: Title of the highlight
 *         coverImage:
 *           type: string
 *           description: URL of the highlight's cover image
 *         storyCount:
 *           type: integer
 *           description: Number of stories in the highlight
 *         stories:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               storyId:
 *                 type: integer
 *                 description: Unique identifier for the story
 *               mediaUrl:
 *                 type: string
 *                 description: URL of the story's media
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *                 description: When the story was created
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: When the story expires
 *               assignedAt:
 *                 type: string
 *                 format: date-time
 *                 description: When the story was added to the highlight
 *               isMine:
 *                 type: boolean
 *                 description: Whether the story belongs to the authenticated user
 *               isViewed:
 *                 type: boolean
 *                 description: Whether the authenticated user has viewed the story
 *               viewCount:
 *                 type: integer
 *                 nullable: true
 *                 description: Number of views for the story (adjusted for self-view, only included for own stories)
 *               likeCount:
 *                 type: integer
 *                 nullable: true
 *                 description: Number of likes for the story (adjusted for self-like, only included for own stories)
 *               latestViewers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                       description: Unique identifier for the viewer
 *                     username:
 *                       type: string
 *                       description: Viewer's username
 *                     profileName:
 *                       type: string
 *                       description: Viewer's profile name
 *                     profilePicture:
 *                       type: string
 *                       description: URL of the viewer's profile picture
 *                     isFollowed:
 *                       type: boolean
 *                       description: Whether the authenticated user follows the viewer
 *                     viewedAt:
 *                       type: string
 *                       format: date-time
 *                       description: When the viewer viewed the story
 *                     isLiked:
 *                       type: boolean
 *                       description: Whether the viewer liked the story
 *                 description: Up to 6 recent viewers, prioritized by likers, followed users, then most recent
 */

/**
 * @swagger
 * /highlights:
 *   post:
 *     summary: Create a new highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - coverImage
 *               - storyIds
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "Summer Vacation"
 *                 description: Title of the highlight
 *               coverImage:
 *                 type: string
 *                 format: binary
 *                 description: Cover image file to upload (JPEG, PNG, WebP)
 *               storyIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *                 description: Array of story IDs to include in the highlight
 *     responses:
 *       201:
 *         description: Highlight created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Highlight'
 *       400:
 *         description: Validation error or invalid file type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "storyIds must be a non-empty array of integers"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                       param:
 *                         type: string
 *                       location:
 *                         type: string
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not authenticated"
 *       403:
 *         description: One or more stories are not owned by the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "One or more stories are not owned by the user"
 *       500:
 *         description: Highlight creation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Highlight creation failed"
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   description: Error details (included in development mode only)
 */
router.post(
  "/",
  authMiddleware,
  upload.fields([{ name: "coverImage", maxCount: 1 }]),
  validateHighlightInput,
  createHighlight
);

/**
 * @swagger
 * /highlights/user/{username}:
 *   get:
 *     summary: Get all highlights for a user with pagination
 *     tags: [Highlights]
 *     description: Retrieves a paginated list of highlights for a user by username (case-insensitive, e.g., 'Mahmoud' matches 'mahmoud'). Includes associated stories with details like isMine, isViewed, viewCount, likeCount, and latestViewers (for own stories). Accessible only to the owner or accepted followers for private accounts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user whose highlights to retrieve (case-insensitive)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *         description: Number of highlights to return per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of highlights to skip for pagination
 *     responses:
 *       200:
 *         description: List of user highlights with stories and viewer details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 highlights:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Highlight'
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of highlights
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 limit:
 *                   type: integer
 *                   description: Number of highlights per page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *       400:
 *         description: Invalid username format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid username format"
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not authenticated"
 *       403:
 *         description: Private account - cannot view highlights
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Private account"
 *                 message:
 *                   type: string
 *                   example: "You must follow @username to view their highlights"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Failed to fetch highlights
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch highlights"
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   description: Error details (included in development mode only)
 */
router.get("/user/:username", authMiddleware, getUserHighlights);

/**
 * @swagger
 * /highlights/{highlightId}:
 *   get:
 *     summary: Get a specific highlight by ID
 *     tags: [Highlights]
 *     description: Retrieves a specific highlight by its ID, including associated stories with details like isMine, isViewed, viewCount, likeCount, and latestViewers (for own stories). Accessible only to the owner or accepted followers for private accounts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: highlightId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the highlight to retrieve
 *     responses:
 *       200:
 *         description: Highlight details with associated stories
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Highlight'
 *       400:
 *         description: Invalid highlight ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid highlight ID"
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not authenticated"
 *       403:
 *         description: Private account - cannot view highlight
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Private account"
 *                 message:
 *                   type: string
 *                   example: "You must follow @username to view their highlights"
 *       404:
 *         description: Highlight not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Highlight not found"
 *       500:
 *         description: Failed to fetch highlight
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch highlight"
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   description: Error details (included in development mode only)
 */
router.get("/:highlightId", authMiddleware, getUserHighlightById);


/**
 * @swagger
 * /highlights/{highlightId}:
 *   put:
 *     summary: Update a highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: highlightId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the highlight to update
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "Updated Vacation"
 *                 description: New title for the highlight (optional)
 *               coverImage:
 *                 type: string
 *                 format: binary
 *                 description: New cover image file to upload (JPEG, PNG, WebP, optional)
 *               storyIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 4, 5]
 *                 description: Array of story IDs to update in the highlight (optional)
 *     responses:
 *       200:
 *         description: Highlight updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Highlight'
 *       400:
 *         description: No valid fields to update or validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No valid fields provided for update"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                       param:
 *                         type: string
 *                       location:
 *                         type: string
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User not authenticated"
 *       403:
 *         description: One or more stories are not owned by the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "One or more stories are not owned by the user"
 *       404:
 *         description: Highlight not found or not owned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Highlight not found or not owned"
 *       500:
 *         description: Failed to update highlight
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to update highlight"
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   description: Error details (included in development mode only)
 */
router.put(
  "/:highlightId",
  authMiddleware,
  upload.fields([{ name: "coverImage", maxCount: 1 }]),
  validateHighlightUpdate,
  updateHighlight
);

/**
 * @swagger
 * /highlights/{highlightId}:
 *   delete:
 *     summary: Delete a highlight
 *     tags: [Highlights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: highlightId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the highlight to delete
 *     responses:
 *       200:
 *         description: Highlight deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 deletedId:
 *                   type: integer
 *       403:
 *         description: You don't own this highlight
 *       404:
 *         description: Highlight not found
 *       500:
 *         description: Deletion failed
 */
router.delete("/:highlightId", authMiddleware, deleteHighlight);

module.exports = router;