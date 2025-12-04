const { body, param, query } = require("express-validator");
const { isValidUserId } = require("../utils/validators");

/**
 * Validation rules for updating user profile
 * Ensures optional fields meet format and length requirements
 * @returns {Array} Express-validator middleware array
 */
const updateProfileValidationRules = [
  body("username")
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Username must be between 3 and 20 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),

  body("email")
    .optional()
    .trim()
    .isEmail()
    .withMessage("Please provide a valid email address"),
  // Removed .normalizeEmail() to preserve the email exactly as provided

  body("bio")
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage("Bio must be less than 150 characters"),

  body("profilePicture")
    .optional()
    .isURL()
    .withMessage("Invalid profile picture URL"),
  body("address").optional().isString(),
  body("jobTitle").optional().isString(),
  // body("dateOfBirth").optional().isDate({ format: "YYYY-MM-DD" }),
];

/**
 * Validation rules for changing user password
 * Ensures old and new passwords meet security requirements
 * @returns {Array} Express-validator middleware array
 */
const changePasswordValidationRules = [
  body("oldPassword").notEmpty().withMessage("Current password is required"),

  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
    ),
];

/**
 * Validation rules for updating privacy settings
 * Ensures privacy setting is a valid boolean
 * @returns {Array} Express-validator middleware array
 */
const updatePrivacySettingsValidationRules = [
  body("isPrivate")
    .notEmpty()
    .withMessage("Privacy setting is required")
    .isBoolean()
    .withMessage("Privacy setting must be a boolean value"),
];

/**
 * Validation rules for user ID parameter
 * Ensures user ID is valid and exists
 * @returns {Array} Express-validator middleware array
 */
const userIdParamValidator = [
  param("userId")
    .isInt({ min: 1 })
    .withMessage("User ID must be a positive integer"),
];

/**
 * Validation rules for follow/unfollow actions
 * Prevents self-following
 * @returns {Array} Express-validator middleware array
 */
const followActionValidator = [
  param("userId").custom((value, { req }) => {
    if (parseInt(value) === req.user.userId) {
      throw new Error("Cannot follow yourself");
    }
    return true;
  }),
];

/**
 * Validation rules for suggestions query parameters
 * Ensures limit is valid
 * @returns {Array} Express-validator middleware array
 */
const suggestionsQueryValidator = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be an integer between 1 and 50"),
];

/**
 * Validation rules for username parameter
 * Ensures username is valid
 * @returns {Array} Express-validator middleware array
 */
const usernameParamValidator = [
  param("username")
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Username must be between 3 and 20 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),
];

module.exports = {
  updateProfileValidationRules,
  changePasswordValidationRules,
  updatePrivacySettingsValidationRules,
  userIdParamValidator,
  followActionValidator,
  suggestionsQueryValidator,
  usernameParamValidator,
};
