/**
 * @file encryption.js
 * @description E2EE for messages using AES-GCM with conversationId-derived key
 */

const crypto = require("crypto");

/**
 * Derive encryption key from conversationId (deterministic per conversation)
 * @param {string} conversationId
 * @returns {Buffer} 256-bit key
 */
const deriveKey = (conversationId) => {
  const secret = process.env.ENCRYPTION_SECRET || "fallback-secret-key-32bytes-min";
  return crypto
    .createHash("sha256")
    .update(conversationId + secret)
    .digest();
};

/**
 * Encrypt message content
 * @param {string} plaintext
 * @param {string} conversationId
 * @returns {string} "iv:authTag:encrypted" (base64)
 */
const encryptMessage = (plaintext, conversationId) => {
  if (!plaintext) return null;

  const key = deriveKey(conversationId);
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
};

/**
 * Decrypt message content
 * @param {string} encryptedData "iv:authTag:encrypted"
 * @param {string} conversationId
 * @returns {string|null} plaintext or null if invalid
 */
const decryptMessage = (encryptedData, conversationId) => {
  if (!encryptedData) return null;

  try {
    const [ivB64, authTagB64, encryptedB64] = encryptedData.split(":");
    const key = deriveKey(conversationId);
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error.message);
    return "[Decryption failed]";
  }
};

module.exports = { encryptMessage, decryptMessage };