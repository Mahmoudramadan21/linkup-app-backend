const express = require("express");
const router = express.Router();
const {
  createStory,
  getUserStories,
  getStoryFeed,
  reportStory,
  deleteStory,
  getStoryById,
  toggleStoryLike,
  getStoryViewersWithLikes,
  recordStoryView,
} = require("../controllers/storyController");
const { authMiddleware } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const rateLimit = require("express-rate-limit");

const storyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each user to 30 story creations per window
  message: "Too many story creations, please try again later",
});

/**
 * @swagger
 * tags:
 *   name: Stories
 *   description: Story management endpoints
 */

/**
 * @swagger
 * /stories:
 *   post:
 *     summary: Create a new story
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               media:
 *                 type: string
 *                 format: binary
 *                 description: Image or video file
 *     responses:
 *       201:
 *         description: Story created successfully
 *       400:
 *         description: Media file is required
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/",
  authMiddleware,
  storyLimiter,
  upload.single("media"),
  createStory
);

/**
 * @swagger
 * /stories/feed:
 *   get:
 *     summary: Get users with active stories from followed users
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of stories to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of users with active stories and view status
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: integer
 *                     example: 1
 *                   username:
 *                     type: string
 *                     example: "johndoe"
 *                   profilePicture:
 *                     type: string
 *                     example: "https://example.com/profile.jpg"
 *                   hasUnviewedStories:
 *                     type: boolean
 *                     example: true
 *                   stories:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         storyId:
 *                           type: integer
 *                           example: 101
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2025-05-12T10:00:00Z"
 *                         mediaUrl:
 *                           type: string
 *                           example: "https://res.cloudinary.com/example/story.jpg"
 *                         expiresAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2025-05-13T10:00:00Z"
 *                         isViewed:
 *                           type: boolean
 *                           example: false
 *       401:
 *         description: Unauthorized
 */
router.get("/feed", authMiddleware, (req, res, next) => {
  console.log("Entering getStoryFeed for user:", req.user.UserID);
  getStoryFeed(req, res, next);
});

/**
 * @swagger
 * /stories/{username}:
 *   get:
 *     summary: Get active stories for a specific user by username
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user whose stories to retrieve
 *     responses:
 *       200:
 *         description: List of active stories with details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   StoryID:
 *                     type: integer
 *                   MediaURL:
 *                     type: string
 *                   CreatedAt:
 *                     type: string
 *                     format: date-time
 *                   ExpiresAt:
 *                     type: string
 *                     format: date-time
 *                   isViewed:
 *                     type: boolean
 *       403:
 *         description: Private account - cannot view stories
 *       404:
 *         description: User not found
 */
router.get("/:username", authMiddleware, getUserStories);

/**
 * @swagger
 * /stories/{storyId}/viewers:
 *   get:
 *     summary: Get viewers of a specific story with their like status
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the story to get viewers for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of viewers to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of viewers with their like status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalViewers:
 *                   type: integer
 *                 viewers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: integer
 *                       username:
 *                         type: string
 *                       profilePicture:
 *                         type: string
 *                       profileName:
 *                         type: string
 *                       viewedAt:
 *                         type: string
 *                         format: date-time
 *                       isLiked:
 *                         type: boolean
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       403:
 *         description: Not authorized to view viewers
 *       404:
 *         description: Story not found
 */
router.get("/:storyId/viewers", authMiddleware, getStoryViewersWithLikes);

/**
 * @swagger
 * /stories/{storyId}/view:
 *   post:
 *     summary: Record a view for a specific story
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the story to record a view for
 *     responses:
 *       200:
 *         description: Story view recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Story has expired
 *       403:
 *         description: Not authorized to view this story or cannot view own story
 *       404:
 *         description: Story not found
 */
router.post("/:storyId/view", authMiddleware, recordStoryView);

/**
 * @swagger
 * /stories/id/{storyId}:
 *   get:
 *     summary: Get a specific story by ID
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the story to retrieve
 *     responses:
 *       200:
 *         description: Story details (owners can access expired stories)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 StoryID:
 *                   type: integer
 *                 MediaURL:
 *                   type: string
 *                 CreatedAt:
 *                   type: string
 *                   format: date-time
 *                 ExpiresAt:
 *                   type: string
 *                   format: date-time
 *                 User:
 *                   type: object
 *                   properties:
 *                     UserID:
 *                       type: integer
 *                     Username:
 *                       type: string
 *                     ProfilePicture:
 *                       type: string
 *                     IsPrivate:
 *                       type: boolean
 *                 _count:
 *                   type: object
 *                   properties:
 *                     StoryLikes:
 *                       type: integer
 *                     StoryViews:
 *                       type: integer
 *                 isLiked:
 *                   type: boolean
 *       403:
 *         description: Private account - cannot view story
 *       404:
 *         description: Story not found or has expired (for non-owners)
 */
router.get("/id/:storyId", authMiddleware, getStoryById);

/**
 * @swagger
 * /stories/{storyId}/like:
 *   post:
 *     summary: Toggle like on a story
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the story to like/unlike
 *     responses:
 *       200:
 *         description: Like toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 action:
 *                   type: string
 *                   enum: [liked, unliked]
 *       400:
 *         description: Story has expired
 *       403:
 *         description: Not authorized to like this story
 *       404:
 *         description: Story not found
 */
router.post("/:storyId/like", authMiddleware, toggleStoryLike);

/**
 * @swagger
 * /stories/{storyId}/report:
 *   post:
 *     summary: Report a story
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: INAPPROPRIATE_CONTENT
 *     responses:
 *       201:
 *         description: Story reported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 reportId:
 *                   type: integer
 *       400:
 *         description: Invalid input or duplicate report
 *       403:
 *         description: No access to private account
 *       404:
 *         description: Story not found
 */
router.post("/:storyId/report", authMiddleware, reportStory);

/**
 * @swagger
 * /stories/{storyId}:
 *   delete:
 *     summary: Delete a story
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the story to delete
 *     responses:
 *       200:
 *         description: Story deleted successfully
 *       403:
 *         description: Not authorized to delete this story
 *       404:
 *         description: Story not found
 */
router.delete("/:storyId", authMiddleware, deleteStory);

module.exports = router;
