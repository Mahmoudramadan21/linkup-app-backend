const redis = require("./redis");
const cron = require("node-cron");
const logger = require("./logger");

/**
 * Periodic cleanup job for expired refresh tokens
 * @returns {void}
 */
const startRedisCleanup = () => {
  // Run every hour at minute 0
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        logger.info("Starting Redis cleanup job for expired refresh tokens");
        const pattern = "refresh_token:*";
        const deletedCount = await redis.delPattern(pattern);
        logger.info(`Redis cleanup job completed, deleted ${deletedCount} expired keys`);
      } catch (error) {
        logger.error("Redis cleanup error", { error: error.message });
      }
    },
    {
      timezone: "Africa/Cairo",
    }
  );
};

/**
 * Manual cleanup for expired refresh tokens
 * @returns {Promise<number>} - Number of keys deleted
 */
const runManualCleanup = async () => {
  try {
    logger.info("Starting manual Redis cleanup for expired refresh tokens");
    const pattern = "refresh_token:*";
    const deletedCount = await redis.delPattern(pattern);
    logger.info(`Manual Redis cleanup completed, deleted ${deletedCount} keys`);
    return deletedCount;
  } catch (error) {
    logger.error("Manual Redis cleanup error", { error: error.message });
    throw error;
  }
};

module.exports = { startRedisCleanup, runManualCleanup };