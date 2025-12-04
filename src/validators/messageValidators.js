const { body, param, query } = require("express-validator");
const prisma = require("../utils/prisma");

/**
 * Validation rules for getting conversations
 * Validates pagination parameters
 */
const getConversationsRules = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1-50"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be positive integer"),
];

/**
 * Validation rules for creating a one-on-one conversation
 * Validates single participant ID
 */
const startConversationRules = [
  body("participantId")
    .isInt()
    .withMessage("Participant ID must be an integer")
    .toInt(),
];

/**
 * Validation rules for getting messages
 * Validates conversation ID and pagination
 */
const getMessagesRules = [
  param("conversationId").isUUID().withMessage("Invalid conversation ID"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1-100"),
  query("before").optional().isISO8601().withMessage("Invalid timestamp"),
];

/**
 * Validation rules for sending a message
 * Validates content, attachments, and reply
 */
const sendMessageRules = [
  param("conversationId")
    .isUUID()
    .withMessage("Invalid conversation ID")
    .custom(async (value, { req }) => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: value },
        select: { participants: { select: { UserID: true } } },
      });
      if (
        !conversation ||
        !conversation.participants.some((p) => p.UserID === req.user.UserID)
      ) {
        throw new Error("Unauthorized access to conversation");
      }
    }),

  body("content")
    .optional()
    .isString()
    .withMessage("Content must be a string")
    .isLength({ max: 2000 })
    .withMessage("Message too long")
    .trim()
    .escape(),

  body("replyToId")
    .optional()
    .isUUID()
    .withMessage("Invalid message ID")
    .custom(async (value, { req }) => {
      const message = await prisma.message.findUnique({
        where: { id: value },
      });
      if (!message || message.conversationId !== req.params.conversationId) {
        throw new Error("Invalid reply message");
      }
    }),

  body().custom((value, { req }) => {
    const hasContent = req.body.content && req.body.content.length > 0;
    const hasAttachment = !!req.file;
    if (!hasContent && !hasAttachment) {
      throw new Error("Content or attachment required");
    }
    return true;
  }),
];

const replyStoryRules = [
  body("storyId")
    .isInt()
    .withMessage("Story ID must be integer")
    .toInt()
    .custom(async (value, { req }) => {
      const story = await prisma.story.findUnique({
        where: { StoryID: value },
        select: {
          StoryID: true,
          UserID: true,
          ExpiresAt: true,
          User: { select: { IsBanned: true } },
        },
      });

      if (!story) throw new Error("Story not found");
      if (story.ExpiresAt < new Date()) throw new Error("Story has expired");
      if (story.User.IsBanned) throw new Error("Cannot reply to banned user");
      if (story.UserID === req.user.UserID)
        throw new Error("Cannot reply to your own story");

      return true;
    }),

  body("content")
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage("Message too long")
    .trim(),
];

/**
 * Validation rules for adding reactions
 * Validates message ID and emoji format
 */
const addReactionRules = [
  param("messageId").isUUID().withMessage("Invalid message ID"),
  body("emoji")
    .notEmpty()
    .withMessage("Emoji required")
    .isLength({ max: 10 })
    .withMessage("Emoji too long")
    .custom((emoji) => {
      const emojiRegex =
        /^(\p{Emoji}|\p{Emoji_Modifier}|\p{Emoji_Component}|[\u2000-\u3300]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])+$/u;
      return emojiRegex.test(emoji);
    })
    .withMessage("Invalid emoji format"),
];

/**
 * Validation rules for typing indicators
 * Validates conversation ID and typing status
 */
const handleTypingRules = [
  body("conversationId").isUUID().withMessage("Invalid conversation ID"),
  body("isTyping").isBoolean().withMessage("Must be boolean"),
];

// validators/messageValidators.js

const searchConversationsRules = [
  query("q")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Search query must be 1-50 characters")
    .escape(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1-50"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be positive integer"),
];

module.exports = {
  getConversationsRules,
  startConversationRules,
  getMessagesRules,
  sendMessageRules,
  replyStoryRules,
  addReactionRules,
  handleTypingRules,
  searchConversationsRules,
};
