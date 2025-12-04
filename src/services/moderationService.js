const logger = require("../utils/logger");
const unsafeKeywords = require("../config/unsafeKeywords.json").keywords;

class ModerationService {
  constructor() {
    // No API or cache configuration needed
  }

  async moderateText(text) {
    try {
      logger.info(`Starting moderation for text: "${text}"`);

      // Validate input
      if (!text || typeof text !== "string" || text.trim() === "") {
        logger.info("No text provided, returning safe");
        return { isSafe: true, details: "No text provided" };
      }

      // Check for unsafe keywords as whole words
      const matchedKeyword = unsafeKeywords.find((keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, "i"); // Case-insensitive, whole word match
        return regex.test(text);
      });

      if (matchedKeyword) {
        const moderationResult = {
          isSafe: false,
          details: `Content contains prohibited keyword: ${matchedKeyword}`,
        };
        logger.info(
          `Moderation result for text: ${text} - Safe: ${moderationResult.isSafe} - Reason: ${moderationResult.details}`
        );
        return moderationResult;
      }

      // If no unsafe keywords found, content is safe
      const moderationResult = { isSafe: true, details: "Content is safe" };
      logger.info(
        `Moderation result for text: ${text} - Safe: ${moderationResult.isSafe} - Reason: ${moderationResult.details}`
      );
      return moderationResult;
    } catch (error) {
      logger.error(`Moderation error: ${error.message}`);
      return {
        isSafe: false,
        details: "Moderation service error, please try again later",
      };
    }
  }
}

module.exports = new ModerationService();
