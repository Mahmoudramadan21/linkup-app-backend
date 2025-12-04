
const redis = require("./redis");

/**
 * Sets a value in Redis with optional expiration
 * @param {string} key - The Redis key
 * @param {any} value - The value to store (will be stringified)
 * @param {number} expiry - Expiration time in seconds
 * @param {string} [userId] - Optional user ID for tracking (now stored as a separate key)
 */
const setWithTracking = async (key, value, expiry, userId) => {
  try {
    // Use set with EX option for expiration
    await redis.set(key, value, expiry); // Remove JSON.stringify, let redis.js handle it

    if (userId) {
      // Store user-key mapping as a separate key instead of using sets
      const userKey = `user:key:${userId}:${key}`;
      await redis.set(userKey, "1", 30 * 24 * 60 * 60); // 30 days expiration
    }
  } catch (error) {
    console.error("Error in setWithTracking:", error);
    throw error;
  }
};

/**
 * Gets a value from Redis
 * @param {string} key - The Redis key
 * @returns {Promise<any>} The value or null if not found
 */
const get = async (key) => {
  try {
    const data = await redis.get(key); // Rely on redis.js to handle JSON parsing
    return data;
  } catch (error) {
    console.error("Error in get:", error);
    throw error;
  }
};

/**
 * Deletes a key from Redis and optionally removes its user tracking
 * @param {string} key - The Redis key to delete
 * @param {string} [userId] - Optional user ID for tracking cleanup
 */
const del = async (key, userId) => {
  try {
    await redis.del(key);

    if (userId) {
      const userKey = `user:key:${userId}:${key}`;
      await redis.del(userKey);
    }
  } catch (error) {
    console.error("Error in del:", error);
    throw error;
  }
};

/**
 * Clears all cached keys associated with a user
 * @param {string} userId - The user ID to clear cache for
 */
const clearUserCache = async (userId) => {
  try {
    // Since we can't scan efficiently without sets, we'll need to:
    // 1. Keep track of keys in a different way (maybe a pattern)
    // 2. Or implement this functionality at the application level

    // For now, we'll just log that this operation isn't fully supported
    console.warn(
      "clearUserCache is not fully implemented without Redis set operations"
    );

    // Alternative: Use SCAN to find all keys matching the user pattern
    // Note: This might be inefficient for large datasets
    const pattern = `user:key:${userId}:*`;
    let cursor = "0";
    do {
      const reply = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = reply[0];
      const keys = reply[1];
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    console.error("Error in clearUserCache:", error);
    throw error;
  }
};

module.exports = { setWithTracking, get, del, clearUserCache };
