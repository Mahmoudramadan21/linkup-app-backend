const prisma = require("./prisma");

/**
 * Validates username format
 * @param {string} username - Username to check
 * @returns {boolean} True if username is valid
 */
const validateUsername = (username) => {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/; // Alphanumeric and underscore, 3-20 chars
  return usernameRegex.test(username);
};

/**
 * Validates email format
 * @param {string} email - Email to check
 * @returns {boolean} True if email is valid
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Basic email format
  return emailRegex.test(email);
};

/**
 * Validates password strength
 * @param {string} password - Password to check
 * @returns {boolean} True if password meets complexity requirements
 */
const validatePassword = (password) => {
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  // Requires: 1 uppercase, 1 lowercase, 1 number, 1 special char, min 8 chars
  return passwordRegex.test(password);
};

const URL_REGEX = /^(https?:\/\/)[^\s$.?#].[^\s]*$/i;
const IMAGE_EXT_REGEX = /\.(jpeg|jpg|png|webp)$/i;

/**
 * Validates if a URL is a valid image link
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is valid and has an image extension
 */
const validateImageUrl = (url) => {
  if (!URL_REGEX.test(url)) return false;
  if (!IMAGE_EXT_REGEX.test(url)) return false;
  return true;
};

/**
 * Validates highlight title length
 * @param {string} title - Title to check
 * @returns {boolean} True if title is between 2 and 50 characters
 */
const validateHighlightTitle = (title) => {
  return title.length >= 2 && title.length <= 50;
};

/**
 * Checks if a user ID exists in the database
 * @param {string|number} userId - User ID to verify
 * @returns {Promise<boolean>} True if user exists
 */
const isValidUserId = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { UserID: parseInt(userId) },
    select: { UserID: true },
  });
  return !!user;
};

module.exports = {
  validateUsername,
  validateEmail,
  validatePassword,
  validateImageUrl,
  validateHighlightTitle,
  isValidUserId,
};
