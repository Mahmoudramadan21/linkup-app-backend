const express = require("express");
const router = express.Router();
const {
  createPost,
  getPosts,
  getExplorePosts,
  getFlicks,
  createBatchPostViews,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  addComment,
  editComment,
  deleteComment,
  likeComment,
  replyToComment,
  savePost,
  reportPost,
  sharePost,
  getPostLikers,
  getPostCommenters,
  getCommentReplies,
} = require("../controllers/postController");
const {
  postCreationRules,
  postUpdateRules,
  reportPostRules,
  commentLikeRules,
  commentReplyRules,
  postShareRules,
  postQueryRules,
  batchPostViewsRules,
  commentEditRules,
} = require("../validators/postValidators");
const { validate } = require("../middleware/validationMiddleware");
const { authMiddleware } = require("../middleware/authMiddleware");
const checkPostOwnership = require("../middleware/postOwnershipMiddleware");
const upload = require("../middleware/uploadMiddleware");
const rateLimit = require("express-rate-limit");
const { moderateContent } = require("../middleware/moderationMiddleware");

// Rate limiting configuration
const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: "Too many requests from this IP, please try again later",
  skip: (req) => req.user?.Role === "ADMIN", // Skip rate limiting for admins
});

/**
 * @swagger
 * tags:
 *   name: Posts
 *   description: Post management endpoints
 */

/**
 * @swagger
 * /posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Post content
 *               media:
 *                 type: string
 *                 format: binary
 *                 description: Image or video file
 *     responses:
 *       201:
 *         description: Post created successfully
 *       400:
 *         description: Invalid input or content violation
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/",
  authMiddleware,
  postLimiter,
  upload.single("media"),
  postCreationRules,
  validate,
  moderateContent,
  createPost
);

/**
 * @swagger
 * /posts:
 *   get:
 *     summary: Get all public posts (paginated)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of posts
 *       401:
 *         description: Unauthorized
 */
router.get("/", authMiddleware, postQueryRules, validate, getPosts);

/**
 * @swagger
 * /posts:
 *   get:
 *     summary: Get all public posts (paginated)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of posts
 *       401:
 *         description: Unauthorized
 */
router.get("/", authMiddleware, postQueryRules, validate, getPosts);

/**
 * @swagger
 * /posts/explore:
 *   get:
 *     summary: Get Explore posts (unseen posts with images or videos from non-followed users)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of unseen posts with images or videos from non-followed users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   PostID:
 *                     type: integer
 *                   UserID:
 *                     type: integer
 *                   Content:
 *                     type: string
 *                     nullable: true
 *                   ImageURL:
 *                     type: string
 *                     nullable: true
 *                   VideoURL:
 *                     type: string
 *                     nullable: true
 *                   CreatedAt:
 *                     type: string
 *                     format: date-time
 *                   UpdatedAt:
 *                     type: string
 *                     format: date-time
 *                   User:
 *                     type: object
 *                     properties:
 *                       UserID:
 *                         type: integer
 *                       Username:
 *                         type: string
 *                       ProfilePicture:
 *                         type: string
 *                         nullable: true
 *                   isMine:
 *                     type: boolean
 *                   isLiked:
 *                     type: boolean
 *                   isSaved:
 *                     type: boolean
 *                   isUnseen:
 *                     type: boolean
 *                   isFollowed:
 *                     type: boolean
 *                   shareCount:
 *                     type: integer
 *                   likeCount:
 *                     type: integer
 *                   commentCount:
 *                     type: integer
 *                   Likes:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         UserID:
 *                           type: integer
 *                         Username:
 *                           type: string
 *                         ProfileName:
 *                           type: string
 *                         ProfilePicture:
 *                           type: string
 *                           nullable: true
 *                         isFollowed:
 *                           type: boolean
 *                         likedAt:
 *                           type: string
 *                           format: date-time
 *                   Comments:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         CommentID:
 *                           type: integer
 *                         Content:
 *                           type: string
 *                         CreatedAt:
 *                           type: string
 *                           format: date-time
 *                         User:
 *                           type: object
 *                           properties:
 *                             UserID:
 *                               type: integer
 *                             Username:
 *                               type: string
 *                             ProfilePicture:
 *                               type: string
 *                               nullable: true
 *                         isMine:
 *                           type: boolean
 *                         isLiked:
 *                           type: boolean
 *                         likeCount:
 *                           type: integer
 *                         replyCount:
 *                           type: integer
 *                         likedBy:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               username:
 *                                 type: string
 *                               profilePicture:
 *                                 type: string
 *                                 nullable: true
 *                         Replies:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               CommentID:
 *                                 type: integer
 *                               Content:
 *                                 type: string
 *                               CreatedAt:
 *                                 type: string
 *                                 format: date-time
 *                               User:
 *                                 type: object
 *                                 properties:
 *                                   UserID:
 *                                     type: integer
 *                                   Username:
 *                                     type: string
 *                                   ProfilePicture:
 *                                     type: string
 *                                     nullable: true
 *                               isMine:
 *                                 type: boolean
 *                               isLiked:
 *                                 type: boolean
 *                               likeCount:
 *                                 type: integer
 *                               likedBy:
 *                                 type: array
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     username:
 *                                       type: string
 *                                     profilePicture:
 *                                       type: string
 *                                       nullable: true
 *                   SharedPost:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       PostID:
 *                         type: integer
 *                       UserID:
 *                         type: integer
 *                       Content:
 *                         type: string
 *                         nullable: true
 *                       ImageURL:
 *                         type: string
 *                         nullable: true
 *                       VideoURL:
 *                         type: string
 *                         nullable: true
 *                       User:
 *                         type: object
 *                         properties:
 *                           UserID:
 *                             type: integer
 *                           Username:
 *                             type: string
 *                           ProfilePicture:
 *                             type: string
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/explore",
  authMiddleware,
  postQueryRules,
  validate,
  getExplorePosts
);

/**
 * @swagger
 * /posts/flicks:
 *   get:
 *     summary: Get Flicks (unseen video-only posts from followed and non-followed users)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of unseen video-only posts with isFollowed status
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   PostID:
 *                     type: integer
 *                   UserID:
 *                     type: integer
 *                   Content:
 *                     type: string
 *                     nullable: true
 *                   VideoURL:
 *                     type: string
 *                   CreatedAt:
 *                     type: string
 *                     format: date-time
 *                   UpdatedAt:
 *                     type: string
 *                     format: date-time
 *                   User:
 *                     type: object
 *                     properties:
 *                       UserID:
 *                         type: integer
 *                       Username:
 *                         type: string
 *                       ProfilePicture:
 *                         type: string
 *                         nullable: true
 *                   isMine:
 *                     type: boolean
 *                   isLiked:
 *                     type: boolean
 *                   isSaved:
 *                     type: boolean
 *                   isUnseen:
 *                     type: boolean
 *                   isFollowed:
 *                     type: boolean
 *                   shareCount:
 *                     type: integer
 *                   likeCount:
 *                     type: integer
 *                   commentCount:
 *                     type: integer
 *                   Likes:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         UserID:
 *                           type: integer
 *                         Username:
 *                           type: string
 *                         ProfileName:
 *                           type: string
 *                         ProfilePicture:
 *                           type: string
 *                           nullable: true
 *                         isFollowed:
 *                           type: boolean
 *                         likedAt:
 *                           type: string
 *                           format: date-time
 *                   Comments:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         CommentID:
 *                           type: integer
 *                         Content:
 *                           type: string
 *                         CreatedAt:
 *                           type: string
 *                           format: date-time
 *                         User:
 *                           type: object
 *                           properties:
 *                             UserID:
 *                               type: integer
 *                             Username:
 *                               type: string
 *                             ProfilePicture:
 *                               type: string
 *                               nullable: true
 *                         isMine:
 *                           type: boolean
 *                         isLiked:
 *                           type: boolean
 *                         likeCount:
 *                           type: integer
 *                         replyCount:
 *                           type: integer
 *                         likedBy:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               username:
 *                                 type: string
 *                               profilePicture:
 *                                 type: string
 *                                 nullable: true
 *                         Replies:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               CommentID:
 *                                 type: integer
 *                               Content:
 *                                 type: string
 *                               CreatedAt:
 *                                 type: string
 *                                 format: date-time
 *                               User:
 *                                 type: object
 *                                 properties:
 *                                   UserID:
 *                                     type: integer
 *                                   Username:
 *                                     type: string
 *                                   ProfilePicture:
 *                                     type: string
 *                                     nullable: true
 *                               isMine:
 *                                 type: boolean
 *                               isLiked:
 *                                 type: boolean
 *                               likeCount:
 *                                 type: integer
 *                               likedBy:
 *                                 type: array
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     username:
 *                                       type: string
 *                                     profilePicture:
 *                                       type: string
 *                                       nullable: true
 *                   SharedPost:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       PostID:
 *                         type: integer
 *                       UserID:
 *                         type: integer
 *                       Content:
 *                         type: string
 *                         nullable: true
 *                       VideoURL:
 *                         type: string
 *                       User:
 *                         type: object
 *                         properties:
 *                           UserID:
 *                             type: integer
 *                           Username:
 *                             type: string
 *                           ProfilePicture:
 *                             type: string
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get("/flicks", authMiddleware, postQueryRules, validate, getFlicks);

/**
 * @swagger
 * /post-views/batch:
 *   post:
 *     summary: Record multiple post views for a user
 *     tags: [PostViews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - postIds
 *             properties:
 *               postIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of post IDs to record as viewed
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Post views recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Post views recorded successfully
 *       400:
 *         description: Invalid input (e.g., postIds is not a valid array)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post(
  "/post-views/batch",
  authMiddleware,
  batchPostViewsRules,
  validate,
  createBatchPostViews
);

/**
 * @swagger
 * /posts/{postId}:
 *   get:
 *     summary: Get a specific post by ID
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post to retrieve
 *     responses:
 *       200:
 *         description: Post details
 *       403:
 *         description: Access to private post denied
 *       404:
 *         description: Post not found
 */
router.get("/:postId", authMiddleware, getPostById);

/**
 * @swagger
 * /posts/{postId}:
 *   put:
 *     summary: Update a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Post updated successfully
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Not authorized to update this post
 *       404:
 *         description: Post not found
 */
router.put(
  "/:postId",
  authMiddleware,
  checkPostOwnership,
  postUpdateRules,
  validate,
  moderateContent,
  updatePost
);

/**
 * @swagger
 * /posts/{postId}:
 *   delete:
 *     summary: Delete a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post to delete
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *       403:
 *         description: Not authorized to delete this post
 *       404:
 *         description: Post not found
 */
router.delete("/:postId", authMiddleware, checkPostOwnership, deletePost);

/**
 * @swagger
 * /posts/{postId}/like:
 *   post:
 *     summary: Like or unlike a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post to like/unlike
 *     responses:
 *       200:
 *         description: Like status toggled successfully
 *       404:
 *         description: Post not found
 */
router.post("/:postId/like", authMiddleware, postLimiter, likePost);

/**
 * @swagger
 * /posts/{postId}/comment:
 *   post:
 *     summary: Add a comment to a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post to comment on
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment added successfully
 *       400:
 *         description: Invalid input or content violation
 *       404:
 *         description: Post not found
 */
router.post(
  "/:postId/comment",
  authMiddleware,
  postLimiter,
  postCreationRules,
  validate,
  moderateContent,
  addComment
);

/**
 * @swagger
 * /posts/comments/{commentId}:
 *   patch:
 *     summary: Edit an existing comment
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the comment to edit
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Updated comment content
 *     responses:
 *       200:
 *         description: Comment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Comment'
 *       400:
 *         description: Invalid input or content violation
 *       403:
 *         description: Not authorized to edit this comment
 *       404:
 *         description: Comment not found
 */
router.patch(
  "/comments/:commentId",
  authMiddleware,
  postLimiter,
  commentEditRules,
  validate,
  moderateContent,
  editComment
);

/**
 * @swagger
 * /posts/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the comment to delete
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       403:
 *         description: Not authorized to delete this comment
 *       404:
 *         description: Comment not found
 */
router.delete(
  "/comments/:commentId",
  authMiddleware,
  postLimiter,
  deleteComment
);

/**
 * @swagger
 * /posts/comments/{commentId}/like:
 *   post:
 *     summary: Like or unlike a comment
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the comment to like/unlike
 *     responses:
 *       200:
 *         description: Like status toggled successfully
 *       404:
 *         description: Comment not found
 *       403:
 *         description: Access to private post denied
 */
router.post(
  "/comments/:commentId/like",
  authMiddleware,
  postLimiter,
  commentLikeRules,
  validate,
  likeComment
);

/**
 * @swagger
 * /posts/comments/{commentId}/reply:
 *   post:
 *     summary: Reply to a comment
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the comment to reply to
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Reply content
 *     responses:
 *       201:
 *         description: Reply added successfully
 *       400:
 *         description: Invalid input or content violation
 *       404:
 *         description: Comment not found
 *       403:
 *         description: Access to private post denied
 */
router.post(
  "/comments/:commentId/reply",
  authMiddleware,
  postLimiter,
  commentReplyRules,
  validate,
  moderateContent,
  replyToComment
);

/**
 * @swagger
 * /posts/{postId}/save:
 *   post:
 *     summary: Save or unsave a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post to save/unsave
 *     responses:
 *       200:
 *         description: Save status toggled successfully
 *       404:
 *         description: Post not found
 */
router.post("/:postId/save", authMiddleware, savePost);

/**
 * @swagger
 * /posts/{postId}/report:
 *   post:
 *     summary: Report a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
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
 *                 example: SPAM
 *     responses:
 *       201:
 *         description: Post reported successfully
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
 *         description: Post not found
 */
router.post(
  "/:postId/report",
  authMiddleware,
  reportPostRules,
  validate,
  reportPost
);

/**
 * @swagger
 * /posts/{postId}/share:
 *   post:
 *     summary: Share a post with optional caption
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post to share
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               caption:
 *                 type: string
 *                 description: Optional caption for the shared post
 *     responses:
 *       201:
 *         description: Post shared successfully
 *       400:
 *         description: Invalid input
 *       403:
 *         description: No access to private post
 *       404:
 *         description: Post not found
 */
router.post(
  "/:postId/share",
  authMiddleware,
  postLimiter,
  postShareRules,
  validate,
  moderateContent,
  sharePost
);

/**
 * @swagger
 * /posts/{postId}/likers:
 *   get:
 *     summary: Get users who liked a specific post (paginated)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of users per page
 *     responses:
 *       200:
 *         description: List of users who liked the post
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 likers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       UserID:
 *                         type: integer
 *                       Username:
 *                         type: string
 *                       ProfileName:
 *                         type: string
 *                       ProfilePicture:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       403:
 *         description: No access to private post
 *       404:
 *         description: Post not found
 */
router.get(
  "/:postId/likers",
  authMiddleware,
  postQueryRules,
  validate,
  getPostLikers
);

/**
 * @swagger
 * /posts/{postId}/commenters:
 *   get:
 *     summary: Get unique users who commented on a specific post (paginated)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the post
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of users per page
 *     responses:
 *       200:
 *         description: List of unique users who commented on the post
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 commenters:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       UserID:
 *                         type: integer
 *                       Username:
 *                         type: string
 *                       ProfileName:
 *                         type: string
 *                       ProfilePicture:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       403:
 *         description: No access to private post
 *       404:
 *         description: Post not found
 */
router.get(
  "/:postId/commenters",
  authMiddleware,
  postQueryRules,
  validate,
  getPostCommenters
);

/**
 * @swagger
 * /comments/{commentId}/replies:
 *   get:
 *     summary: Get replies for a specific comment (paginated)
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent comment
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of replies per page
 *     responses:
 *       200:
 *         description: List of replies for the comment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 replies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       CommentID:
 *                         type: integer
 *                       PostID:
 *                         type: integer
 *                       ParentCommentID:
 *                         type: integer
 *                       User:
 *                         type: object
 *                         properties:
 *                           UserID:
 *                             type: integer
 *                           Username:
 *                             type: string
 *                           ProfileName:
 *                             type: string
 *                           ProfilePicture:
 *                             type: string
 *                           isFollowed:
 *                             type: boolean
 *                       Content:
 *                         type: string
 *                       CreatedAt:
 *                         type: string
 *                       isMine:
 *                         type: boolean
 *                       isLiked:
 *                         type: boolean
 *                       likeCount:
 *                         type: integer
 *                       replyCount:
 *                         type: integer
 *                       likedBy:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             username:
 *                               type: string
 *                             profilePicture:
 *                               type: string
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       403:
 *         description: No access to parent comment/post
 *       404:
 *         description: Comment not found
 */
router.get(
  "/comments/:commentId/replies",
  authMiddleware,
  postQueryRules,
  validate,
  getCommentReplies
);

module.exports = router;
