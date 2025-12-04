const express = require("express");
const {
  getProfile,
  updateProfile,
  changePassword,
  updatePrivacySettings,
  deleteProfile,
  getSavedPosts,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  acceptFollowRequest,
  rejectFollowRequest,
  getPendingFollowRequests,
  getUserPosts,
  getUserStories,
  getUserSuggestions,
  getProfileByUsername,
  removeFollower,
} = require("../controllers/profileController");
const { validate } = require("../middleware/validationMiddleware");
const {
  updateProfileValidationRules,
  changePasswordValidationRules,
  updatePrivacySettingsValidationRules,
  userIdParamValidator,
  followActionValidator,
  suggestionsQueryValidator,
  usernameParamValidator,
} = require("../validators/profileValidators");
const { authMiddleware } = require("../middleware/authMiddleware");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: User profile management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *         username:
 *           type: string
 *         email:
 *           type: string
 *         profilePicture:
 *           type: string
 *           nullable: true
 *         coverPicture:
 *           type: string
 *           nullable: true
 *         bio:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *           nullable: true
 *         jobTitle:
 *           type: string
 *           nullable: true
 *         dateOfBirth:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         isPrivate:
 *           type: boolean
 *         role:
 *           type: string
 *           enum: [USER, ADMIN]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         postCount:
 *           type: integer
 *         followerCount:
 *           type: integer
 *         followingCount:
 *           type: integer
 *         likeCount:
 *           type: integer
 *     Post:
 *       type: object
 *       properties:
 *         PostID:
 *           type: integer
 *           description: Unique identifier for the post
 *         UserID:
 *           type: integer
 *           description: ID of the user who created the post
 *         Content:
 *           type: string
 *           description: Content of the post
 *         ImageURL:
 *           type: string
 *           nullable: true
 *           description: URL of the post's image, if any
 *         VideoURL:
 *           type: string
 *           nullable: true
 *           description: URL of the post's video, if any
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when the post was created
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when the post was last updated
 *         saveTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Timestamp when the post was saved (only for saved posts)
 *         User:
 *           type: object
 *           properties:
 *             UserID:
 *               type: integer
 *             Username:
 *               type: string
 *             ProfilePicture:
 *               type: string
 *               nullable: true
 *             IsPrivate:
 *               type: boolean
 *           description: Details of the user who created the post
 *         SharedPost:
 *           type: object
 *           nullable: true
 *           properties:
 *             PostID:
 *               type: integer
 *             UserID:
 *               type: integer
 *             Content:
 *               type: string
 *             CreatedAt:
 *               type: string
 *               format: date-time
 *             UpdatedAt:
 *               type: string
 *               format: date-time
 *             User:
 *               type: object
 *               properties:
 *                 UserID:
 *                   type: integer
 *                 Username:
 *                   type: string
 *                 ProfilePicture:
 *                   type: string
 *                   nullable: true
 *           description: Details of the shared post, if applicable
 *         isMine:
 *           type: boolean
 *           description: Whether the post belongs to the current user
 *         isLiked:
 *           type: boolean
 *           description: Whether the current user has liked the post
 *         isSaved:
 *           type: boolean
 *           description: Whether the current user has saved the post
 *         isUnseen:
 *           type: boolean
 *           description: Whether the post is unseen by the current user
 *         isFollowed:
 *           type: boolean
 *           description: Whether the current user follows the post's author
 *         shareCount:
 *           type: integer
 *           description: Number of times the post has been shared
 *         likeCount:
 *           type: integer
 *           description: Number of likes on the post
 *         commentCount:
 *           type: integer
 *           description: Number of comments on the post
 *         Likes:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               UserID:
 *                 type: integer
 *               Username:
 *                 type: string
 *               ProfileName:
 *                 type: string
 *                 nullable: true
 *               ProfilePicture:
 *                 type: string
 *                 nullable: true
 *               isFollowed:
 *                 type: boolean
 *               likedAt:
 *                 type: string
 *                 format: date-time
 *           description: List of users who liked the post (up to 10)
 *         Comments:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               CommentID:
 *                 type: integer
 *               Content:
 *                 type: string
 *               CreatedAt:
 *                 type: string
 *                 format: date-time
 *               User:
 *                 type: object
 *                 properties:
 *                   UserID:
 *                     type: integer
 *                   Username:
 *                     type: string
 *                   ProfilePicture:
 *                     type: string
 *                     nullable: true
 *               isMine:
 *                 type: boolean
 *               isLiked:
 *                 type: boolean
 *               likeCount:
 *                 type: integer
 *               replyCount:
 *                 type: integer
 *               likedBy:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     username:
 *                       type: string
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *               Replies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     CommentID:
 *                       type: integer
 *                     Content:
 *                       type: string
 *                     CreatedAt:
 *                       type: string
 *                       format: date-time
 *                     User:
 *                       type: object
 *                       properties:
 *                         UserID:
 *                           type: integer
 *                         Username:
 *                           type: string
 *                         ProfilePicture:
 *                           type: string
 *                           nullable: true
 *                     isMine:
 *                       type: boolean
 *                     isLiked:
 *                       type: boolean
 *                     likeCount:
 *                       type: integer
 *                     likedBy:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           username:
 *                             type: string
 *                           profilePicture:
 *                             type: string
 *                             nullable: true
 *           description: List of comments on the post (up to 3, prioritized by user/followed)
 */

/**
 * @swagger
 * /profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get user profile
 *     description: Retrieve the user's profile information, including counts for posts, followers, following, and likes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.get("/", authMiddleware, getProfile);

/**
 * @swagger
 * /profile/edit:
 *   put:
 *     tags: [Profile]
 *     summary: Update user profile
 *     description: Update the user's profile information (username, email, bio, address, job title, date of birth, profile picture, cover picture, isPrivate, firstName, lastName) using form data. profileName is automatically generated from firstName and lastName.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: Unique username
 *               email:
 *                 type: string
 *                 description: Unique email address
 *               bio:
 *                 type: string
 *                 description: User biography
 *               address:
 *                 type: string
 *                 description: User's address
 *               jobTitle:
 *                 type: string
 *                 description: User's job title
 *               dateOfBirth:
 *                 type: string
 *                 description: User's date of birth (e.g., YYYY-MM-DD)
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *                 description: Profile picture file to upload
 *               coverPicture:
 *                 type: string
 *                 format: binary
 *                 description: Cover picture file to upload
 *               isPrivate:
 *                 type: boolean
 *                 description: Whether the user's profile is private (true) or public (false)
 *               firstName:
 *                 type: string
 *                 description: User's first name (used to generate profileName)
 *               lastName:
 *                 type: string
 *                 description: User's last name (used to generate profileName)
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 profile:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                     coverPicture:
 *                       type: string
 *                       nullable: true
 *                     bio:
 *                       type: string
 *                       nullable: true
 *                     address:
 *                       type: string
 *                       nullable: true
 *                     jobTitle:
 *                       type: string
 *                       nullable: true
 *                     dateOfBirth:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     isPrivate:
 *                       type: boolean
 *                     role:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     profileName:
 *                       type: string
 *                       nullable: true
 *       400:
 *         description: Invalid input or duplicate username/email
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.put(
  "/edit",
  authMiddleware,
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "coverPicture", maxCount: 1 },
  ]),
  updateProfileValidationRules,
  validate,
  updateProfile
);

/**
 * @swagger
 * /profile/change-password:
 *   put:
 *     tags: [Profile]
 *     summary: Change user password
 *     description: Change the user's password by verifying the old password using form data.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 description: Current password
 *               newPassword:
 *                 type: string
 *                 description: New password
 *             required:
 *               - oldPassword
 *               - newPassword
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input or old password is incorrect
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.put(
  "/change-password",
  authMiddleware,
  upload.none(),
  changePasswordValidationRules,
  validate,
  changePassword
);

/**
 * @swagger
 * /profile/privacy:
 *   put:
 *     tags: [Profile]
 *     summary: Update privacy settings
 *     description: Update the user's privacy settings (e.g., make account private or public) using form data.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               isPrivate:
 *                 type: boolean
 *                 description: Whether the account is private
 *             required:
 *               - isPrivate
 *     responses:
 *       200:
 *         description: Privacy settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 profile:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/privacy",
  authMiddleware,
  upload.none(),
  updatePrivacySettingsValidationRules,
  validate,
  updatePrivacySettings
);

/**
 * @swagger
 * /profile:
 *   delete:
 *     tags: [Profile]
 *     summary: Delete user profile
 *     description: Delete the user's profile and all associated data.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/", authMiddleware, deleteProfile);

/**
 * @swagger
 * /profile/posts/{username}:
 *   get:
 *     summary: Get all posts by a specific user
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user whose posts to retrieve
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
 *         description: Number of posts per page
 *     responses:
 *       200:
 *         description: List of user posts, sorted by creation date (newest to oldest)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
 *       400:
 *         description: Invalid username format
 *       403:
 *         description: Private account - must follow to view posts
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get(
  "/posts/:username",
  authMiddleware,
  usernameParamValidator,
  validate,
  getUserPosts
);

/**
 * @swagger
 * /profile/stories:
 *   get:
 *     tags: [Profile]
 *     summary: Get paginated stories for the authenticated user
 *     description: Retrieve a paginated list of stories (expired and active) belonging to the authenticated user. Supports pagination via limit and offset query parameters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: Maximum number of stories to return (default 10, max 50)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of stories to skip before starting to collect the result set
 *     responses:
 *       200:
 *         description: Paginated list of stories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of stories for the user
 *                 limit:
 *                   type: integer
 *                   description: Limit applied to the query
 *                 offset:
 *                   type: integer
 *                   description: Offset applied to the query
 *                 hasMore:
 *                   type: boolean
 *                   description: Indicates if there are more stories available
 *                 stories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       storyId:
 *                         type: integer
 *                       mediaUrl:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/stories", authMiddleware, getUserStories);

/**
 * @swagger
 * /profile/saved-posts:
 *   get:
 *     summary: Get saved posts
 *     description: Retrieve the posts saved by the user, sorted by save time (newest to oldest)
 *     tags: [Profile]
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
 *         description: Number of posts per page
 *     responses:
 *       200:
 *         description: Saved posts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Post'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Error fetching saved posts
 */
router.get("/saved-posts", authMiddleware, getSavedPosts);

/**
 * @swagger
 * /profile/follow/{userId}:
 *   post:
 *     tags: [Profile]
 *     summary: Follow a user
 *     description: Follow another user using form data. If the target account is private, this will send a follow request. For public accounts, the follow will be immediate.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to follow
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID of the user to follow (optional, overrides path param)
 *     responses:
 *       201:
 *         description: Followed successfully or request sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [PENDING, ACCEPTED]
 *       400:
 *         description: Validation error or cannot follow yourself
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       409:
 *         description: Already following or request pending
 *       429:
 *         description: Too many requests
 */
router.post(
  "/follow/:userId",
  authMiddleware,
  upload.none(),
  userIdParamValidator,
  followActionValidator,
  validate,
  followUser
);

/**
 * @swagger
 * /profile/unfollow/{userId}:
 *   delete:
 *     tags: [Profile]
 *     summary: Unfollow a user
 *     description: Stop following another user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to unfollow
 *     responses:
 *       200:
 *         description: Unfollowed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Cannot unfollow yourself
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Follow relationship not found
 */
router.delete(
  "/unfollow/:userId",
  authMiddleware,
  userIdParamValidator,
  validate,
  unfollowUser
);

/**
 * @swagger
 * /profile/remove-follower/{followerId}:
 *   delete:
 *     tags: [Profile]
 *     summary: Remove a follower
 *     description: Remove a user from the current user's followers list.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: followerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to remove as a follower
 *     responses:
 *       200:
 *         description: Follower removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid follower ID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Follower relationship not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  "/remove-follower/:followerId",
  authMiddleware,
  validate,
  removeFollower
);

/**
 * @swagger
 * /profile/follow-requests/pending:
 *   get:
 *     tags: [Profile]
 *     summary: Get pending follow requests
 *     description: Retrieve a list of pending follow requests for private accounts.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending follow requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                 pendingRequests:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FollowRequest'
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/follow-requests/pending",
  authMiddleware,
  getPendingFollowRequests
);

/**
 * @swagger
 * /profile/follow-requests/{requestId}/accept:
 *   put:
 *     tags: [Profile]
 *     summary: Accept follow request
 *     description: Accept a pending follow request for a private account using form data.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the follow request to accept
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               requestId:
 *                 type: integer
 *                 description: ID of the follow request (optional, overrides path param)
 *     responses:
 *       200:
 *         description: Follow request accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 acceptedFollowers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Follow request not found or already processed
 */
router.put(
  "/follow-requests/:requestId/accept",
  authMiddleware,
  upload.none(),
  acceptFollowRequest
);

/**
 * @swagger
 * /profile/follow-requests/{requestId}/reject:
 *   delete:
 *     tags: [Profile]
 *     summary: Reject follow request
 *     description: Reject a pending follow request for a private account.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the follow request to reject
 *     responses:
 *       200:
 *         description: Follow request rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Follow request not found or already processed
 */
router.delete(
  "/follow-requests/:requestId/reject",
  authMiddleware,
  rejectFollowRequest
);

/**
 * @swagger
 * /profile/followers/{username}:
 *   get:
 *     tags: [Profile]
 *     summary: Get user's followers
 *     description: Retrieve a paginated list of users who follow the specified user by username (case-insensitive, e.g., 'Mahmoud' matches 'mahmoud'). Prioritizes the current user, then users followed by the current user, then others, sorted by recent interactions (likes, comments, story views). Accessible only to the owner or accepted followers for private accounts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user whose followers to retrieve (case-insensitive)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of followers to return per page
 *     responses:
 *       200:
 *         description: List of followers with pagination metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of followers in the current page
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of followers
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 limit:
 *                   type: integer
 *                   description: Number of followers per page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *                 followers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid username format or pagination parameters
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
 *         description: Private account - cannot view followers
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
 *                   example: "You must follow @username to view their followers"
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
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   description: Error details (included in development mode only)
 */
router.get(
  "/followers/:username",
  authMiddleware,
  usernameParamValidator,
  validate,
  getFollowers
);

/**
 * @swagger
 * /profile/following/{username}:
 *   get:
 *     tags: [Profile]
 *     summary: Get users followed by a user
 *     description: Retrieve a paginated list of users that the specified user is following by username (case-insensitive, e.g., 'Mahmoud' matches 'mahmoud'). Prioritizes the current user, then users followed by the current user, then others, sorted by recent interactions (likes, comments, story views). Accessible only to the owner or accepted followers for private accounts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user whose following list to retrieve (case-insensitive)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of followed users to return per page
 *     responses:
 *       200:
 *         description: List of followed users with pagination metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of followed users in the current page
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of followed users
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 limit:
 *                   type: integer
 *                   description: Number of followed users per page
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *                 following:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid username format or pagination parameters
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
 *         description: Private account - cannot view following list
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
 *                   example: "You must follow @username to view who they follow"
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
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   description: Error details (included in development mode only)
 */
router.get(
  "/following/:username",
  authMiddleware,
  usernameParamValidator,
  validate,
  getFollowing
);

/**
 * @swagger
 * /profile/suggestions:
 *   get:
 *     tags: [Profile]
 *     summary: Get user suggestions
 *     description: Retrieve a list of random users that the current user is not following, for follow suggestions.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *         description: Number of user suggestions to retrieve
 *     responses:
 *       200:
 *         description: List of user suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                 suggestions:
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
 *                         nullable: true
 *                       bio:
 *                         type: string
 *                         nullable: true
 *       400:
 *         description: Invalid limit parameter
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(
  "/suggestions",
  authMiddleware,
  suggestionsQueryValidator,
  validate,
  getUserSuggestions
);

/**
 * @swagger
 * /profile/{username}:
 *   get:
 *     tags: [Profile]
 *     summary: Get user profile by username
 *     description: Retrieve the profile of a user by their username. Public and private profiles return basic details (excluding posts and highlights) even if not followed. Includes up to 3 users who follow the profile and are followed by the current user, prioritized by recent interactions.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user whose profile to retrieve
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                       description: Unique identifier for the user
 *                     username:
 *                       type: string
 *                       description: Username of the user
 *                     profilePicture:
 *                       type: string
 *                       nullable: true
 *                       description: URL of the user's profile picture
 *                     coverPicture:
 *                       type: string
 *                       nullable: true
 *                       description: URL of the user's cover picture
 *                     bio:
 *                       type: string
 *                       nullable: true
 *                       description: User's bio
 *                     address:
 *                       type: string
 *                       nullable: true
 *                       description: User's address
 *                     jobTitle:
 *                       type: string
 *                       nullable: true
 *                       description: User's job title
 *                     dateOfBirth:
 *                       type: string
 *                       format: date-time
 *                       description: User's date of birth
 *                     isPrivate:
 *                       type: boolean
 *                       description: Whether the user's profile is private
 *                     role:
 *                       type: string
 *                       enum: [USER, ADMIN, BANNED]
 *                       description: User's role
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       description: When the user account was created
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       description: When the user account was last updated
 *                     postCount:
 *                       type: integer
 *                       description: Number of posts by the user
 *                     followerCount:
 *                       type: integer
 *                       description: Number of followers
 *                     followingCount:
 *                       type: integer
 *                       description: Number of users the user is following
 *                     likeCount:
 *                       type: integer
 *                       description: Number of likes on the user's posts
 *                     isFollowed:
 *                       type: boolean
 *                       description: Whether the current user is following this profile
 *                     profileName:
 *                       type: string
 *                       description: User's display name
 *                     followStatus:
 *                       type: string
 *                       enum: [NONE, ACCEPTED, PENDING]
 *                       description: The current follow request status (NONE if no request, ACCEPTED if followed, PENDING if request sent but not accepted)
 *                     hasUnViewedStories:
 *                       type: boolean
 *                       description: Whether the user has any unviewed stories
 *                     hasAccess:
 *                       type: boolean
 *                       description: Whether the current user has access to view the profile (true if public or followed, false if private and not followed)
 *                     followedBy:
 *                       type: array
 *                       description: Up to 3 users who follow this profile and are followed by the current user, prioritized by recent interactions (likes, comments, story views)
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: integer
 *                             description: Unique identifier for the follower
 *                           username:
 *                             type: string
 *                             description: Follower's username
 *                           profileName:
 *                             type: string
 *                             description: Follower's display name
 *                           profilePicture:
 *                             type: string
 *                             nullable: true
 *                             description: URL of the follower's profile picture
 *                           isFollowed:
 *                             type: boolean
 *                             description: Whether the current user follows this follower (always true)
 *                           latestInteraction:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             description: Time of the follower's most recent interaction with the profile (like, comment, or story view)
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
 *         description: User is banned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User is banned"
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
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   description: Error details (included in development mode only)
 */
router.get(
  "/:username",
  authMiddleware,
  usernameParamValidator,
  validate,
  getProfileByUsername
);

module.exports = router;