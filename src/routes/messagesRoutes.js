const express = require("express");
const router = express.Router();
const { validate } = require("../middleware/validationMiddleware");
const { authMiddleware } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const rateLimit = require("express-rate-limit");
const {
  getConversationsRules,
  sendMessageRules,
  editMessageRules,
  searchMessagesRules,
  startConversationRules,
  replyStoryRules,
  searchConversationsRules
} = require("../validators/messageValidators");
const {
  getConversations,
  startConversation,
  getMessages,
  sendMessage,
  replyToStory,
  editMessage,
  deleteMessage,
  searchMessages,
  searchConversations
} = require("../controllers/messagesController");

// Rate limiting: 30 messages per 15 seconds per user
const messageRateLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 30,
  keyGenerator: (req) => `msg:${req.user.UserID}`,
  message: "Too many messages. Please slow down.",
  skip: (req) => req.user?.Role === "ADMIN",
});

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: Secure, real-time one-on-one messaging with E2EE, voice, link preview, infinite scroll, and reactions
 */

/**
 * @swagger
 * /messages/conversations:
 *   get:
 *     summary: Get paginated list of user's conversations
 *     description: Returns conversations with last message, unread count, and other participant info. Optimized to avoid N+1.
 *     tags: [Messages]
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
 *           default: 15
 *           maximum: 50
 *         description: Number of conversations per page
 *     responses:
 *       200:
 *         description: List of conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       conversationId:
 *                         type: string
 *                       lastMessage:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                           content:
 *                             type: string
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           senderId:
 *                             type: integer
 *                       unreadCount:
 *                         type: integer
 *                       otherParticipant:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           UserID:
 *                             type: integer
 *                           Username:
 *                             type: string
 *                           ProfilePicture:
 *                             type: string
 *                             nullable: true
 *                           LastActive:
 *                             type: string
 *                             format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/conversations",
  authMiddleware,
  getConversationsRules,
  validate,
  getConversations
);

/**
 * @swagger
 * /messages/start:
 *   post:
 *     summary: Start a conversation with a user
 *     description: Creates a new conversation if not exists, or returns existing one
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participantId]
 *             properties:
 *               participantId:
 *                 type: integer
 *                 description: UserID of the person to message
 *     responses:
 *       200:
 *         description: Conversation ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: string
 *                 participants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       UserID: { type: integer }
 *                       Username: { type: string }
 *                       ProfilePicture: { type: string, nullable: true }
 *       400:
 *         description: Invalid participant or cannot message self
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/start",
  authMiddleware,
  startConversationRules,
  validate,
  startConversation
);

/**
 * @swagger
 * /messages/conversations/{conversationId}/messages:
 *   get:
 *     summary: Get messages in a conversation (infinite scroll)
 *     description: Returns decrypted messages with attachments, reactions, and reply info. Supports pagination via `before`.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the conversation
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of messages to return
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO timestamp to load messages before this time
 *     responses:
 *       200:
 *         description: List of decrypted messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       Id:
 *                         type: string
 *                       Content:
 *                         type: string
 *                         nullable: true
 *                       CreatedAt:
 *                         type: string
 *                         format: date-time
 *                       Sender:
 *                         type: object
 *                         properties:
 *                           UserID:
 *                             type: integer
 *                           Username:
 *                             type: string
 *                           ProfilePicture:
 *                             type: string
 *                             nullable: true
 *                       Attachments:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/Attachment'
 *                       Reactions:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             User:
 *                               type: object
 *                               properties:
 *                                 UserID:
 *                                   type: integer
 *                                 Username:
 *                                   type: string
 *                             Emoji:
 *                               type: string
 *                       ReadBy:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             UserID:
 *                               type: integer
 *                       ReplyTo:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           Id:
 *                             type: string
 *                           Content:
 *                             type: string
 *                           SenderId:
 *                             type: integer
 *                           IsDeleted:
 *                             type: boolean
 *                       IsEdited:
 *                         type: boolean
 *                       IsDeleted:
 *                         type: boolean
 *                 hasMore:
 *                   type: boolean
 *       403:
 *         description: Not a participant in this conversation
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  validate,
  getMessages
);

/**
 * @swagger
 * /messages/conversations/{conversationId}/messages:
 *   post:
 *     summary: Send a new message (text, voice, image, file, or reply)
 *     description: Supports E2EE, link preview, voice notes, and file attachments. Rate limited.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message text (optional if attachment exists)
 *               attachment:
 *                 type: string
 *                 format: binary
 *                 description: Image, video, audio, or file
 *               replyToId:
 *                 type: string
 *                 description: ID of message being replied to
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Invalid input or missing content/attachment
 *       403:
 *         description: Not a participant
 *       429:
 *         description: Rate limit exceeded
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  messageRateLimiter,
  upload.single("attachment"),
  // sendMessageRules,
  validate,
  sendMessage
);

/**
 * @swagger
 * /messages/reply-story:
 *   post:
 *     summary: Reply to a story with reference (Instagram-style)
 *     description: |
 *       Sends a message referencing a specific story.
 *       - The story appears as a preview in chat
 *       - Clicking it opens the original story
 *       - Auto-creates conversation if needed
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storyId]
 *             properties:
 *               storyId:
 *                 type: integer
 *                 description: ID of the story being replied to
 *               content:
 *                 type: string
 *                 description: Optional text message
 *     responses:
 *       201:
 *         description: Reply sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *                 conversationId:
 *                   type: string
 *                 isNewConversation:
 *                   type: boolean
 *                 storyPreview:
 *                   type: object
 *                   properties:
 *                     StoryID: { type: integer }
 *                     MediaURL: { type: string }
 *                     ExpiresAt: { type: string, format: date-time }
 */
router.post(
  "/reply-story",
  authMiddleware,
  messageRateLimiter,
  replyStoryRules,
  validate,
  replyToStory
);

/**
 * @swagger
 * /messages/{messageId}/update:
 *   patch:
 *     summary: Edit a message (sender only)
 *     description: Updates message content. Only the sender can edit.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: New message content
 *     responses:
 *       200:
 *         description: Message edited successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       403:
 *         description: Not the sender of the message
 *       404:
 *         description: Message not found
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/:messageId/update",
  authMiddleware,
  // editMessageRules,
  validate,
  editMessage
);

/**
 * @swagger
 * /messages/{messageId}/delete:
 *   delete:
 *     summary: Delete a message (sender only)
 *     description: Soft deletes the message. Only the sender can delete.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       403:
 *         description: Not the sender of the message
 *       404:
 *         description: Message not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:messageId/delete", authMiddleware, validate, deleteMessage);

/**
 * @swagger
 * /messages/conversations/{conversationId}/search:
 *   get:
 *     summary: Search messages within a conversation
 *     description: Full-text search with case-insensitive matching on decrypted content.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Search results with decrypted content
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       Id:
 *                         type: string
 *                       Content:
 *                         type: string
 *                       CreatedAt:
 *                         type: string
 *                         format: date-time
 *                       SenderId:
 *                         type: integer
 *       400:
 *         description: Missing search query
 *       403:
 *         description: Not a participant
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/conversations/:conversationId/search",
  authMiddleware,
  // searchMessagesRules,
  validate,
  searchMessages
);


/**
 * @swagger
 * /messages/conversations/search:
 *   get:
 *     summary: Search user's conversations by participant name or username
 *     description: |
 *       Searches through user's active conversations for participants matching the query.
 *       Returns the same format as `/conversations` but filtered by search term.
 *       Supports pagination and real-time updates.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         description: Search term (username or display name)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *           maximum: 50
 *         description: Results per page
 *     responses:
 *       200:
 *         description: Filtered conversations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ConversationSearchResponse'
 *       400:
 *         description: Missing or invalid search query
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/conversations/search",
  authMiddleware,
  searchConversationsRules,
  validate,
  searchConversations
);

module.exports = router;