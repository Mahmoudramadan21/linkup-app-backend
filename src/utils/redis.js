// utils/redis.js
const { Redis } = require("@upstash/redis");
const logger = require("./logger");

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error("Missing Upstash Redis environment variables (URL/TOKEN)");
}

// Initialize Upstash Redis client (REST API)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Test the connection
redis
  .ping()
  .then(() => {
    logger.info("✅ Connected to Upstash Redis successfully");
  })
  .catch((err) => {
    logger.error("❌ Failed to connect to Upstash Redis", { error: err.message });
    throw err;
  });

class RedisClient {
  constructor() {
    this.client = redis;
  }

  /**
   * Get value by key
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async get(key) {
    try {
      const value = await this.client.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value; // return as plain string if not JSON
      }
    } catch (err) {
      logger.error(`Redis GET error for key "${key}": ${err.message}`);
      return null;
    }
  }

  /**
   * Set value with optional TTL (default: 3600s)
   * @param {string} key
   * @param {any} value
   * @param {number} [ttl=3600]
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttl = 3600) {
    try {
      let storeValue;
      if (typeof value === "string") {
        storeValue = value; // refresh tokens, plain strings
      } else {
        storeValue = JSON.stringify(value); // objects
      }

      if (ttl) {
        await this.client.set(key, storeValue, { ex: ttl });
      } else {
        await this.client.set(key, storeValue);
      }

      return true;
    } catch (err) {
      logger.error(`Redis SET error for key "${key}": ${err.message}`);
      return false;
    }
  }


  /**
   * Delete a key
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async del(key) {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (err) {
      logger.error(`Redis DEL error for key "${key}": ${err.message}`);
      return false;
    }
  }

  /**
   * Check if a key exists
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (err) {
      logger.error(`Redis EXISTS error for key "${key}": ${err.message}`);
      return false;
    }
  }

  /**
   * Execute multiple commands as a transaction
   * @param {Array} operations
   * Example:
   * [
   *   { type: "set", key: "k1", value: "v1", ttl: 60 },
   *   { type: "del", key: "k2" }
   * ]
   */
  async execMulti(operations = []) {
    try {
      const tx = this.client.multi();

      for (const op of operations) {
        if (op.type === "set") {
          const storeValue =
            typeof op.value === "string" ? op.value : JSON.stringify(op.value);
          if (op.ttl) {
            tx.set(op.key, storeValue, { ex: op.ttl });
          } else {
            tx.set(op.key, storeValue);
          }
        } else if (op.type === "del") {
          tx.del(op.key);
        }
      }

      return await tx.exec();
    } catch (err) {
      logger.error(`Redis MULTI/EXEC error: ${err.message}`);
      return null;
    }
  }

  /**
   * Disconnect (not needed with Upstash HTTP client, but for consistency)
   */
  async disconnect() {
    try {
      logger.info("Disconnected from Upstash Redis (HTTP-based, no socket).");
    } catch (err) {
      logger.error("Error disconnecting from Redis:", err.message);
    }
  }
}

module.exports = new RedisClient();
