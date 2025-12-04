const moderationService = require("../services/moderationService");
const logger = require("../utils/logger");
const { handleValidationError } = require("../utils/errorHandler");

const moderateContent = async (req, res, next) => {
  try {
    const text = req.body.content || "";
    logger.info(`Moderation middleware processing text: "${text}"`);
    const { isSafe, details } = await moderationService.moderateText(text);

    if (!isSafe) {
      const io = req.app.get("io");
      io.to(`user_${req.user.UserID}`).emit("contentRejected", {
        userId: req.user.UserID,
        reason: details,
      });
      logger.info(`Content rejected for user ${req.user.UserID}: ${details}`);
      return res.status(400).json({ error: details });
    }

    logger.info(`Content passed moderation: "${text}"`);
    next();
  } catch (error) {
    logger.error(`Moderation middleware error: ${error.message}`);
    return res.status(503).json({
      error: "Moderation service unavailable, please try again later",
    });
  }
};

module.exports = { moderateContent };
