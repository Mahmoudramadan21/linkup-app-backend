const { query } = require("express-validator");

/**
 * Validation rules for search input
 * This includes checks for query, type, page, and limit
 */
const searchValidationRules = [
  query("query")
    .notEmpty()
    .withMessage("Search query is required") // Check if query is not empty
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search query must be between 1 and 100 characters"), // Check query length
  query("type")
    .optional()
    .isIn(["ALL", "USERS", "POSTS"])
    .withMessage("Type must be one of ALL, USERS, POSTS"), // Check if type is valid
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer") // Check if page is a positive number
    .toInt(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1-50") // Check if limit is between 1 and 50
    .toInt(),
];

/**
 * Validation rules for messenger search input
 * This is a subset of the general search rules, with additional constraints
 */
const messangerSearchValidationRules = [
  query("query")
    .notEmpty()
    .withMessage("Search query is required") // Check if query is not empty
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search query must be between 1 and 100 characters"), // Check query length
  query("type")
    .optional()
    .isIn(["USER", "MESSAGE"])
    .withMessage("Type must be one of USER, MESSAGE"), // Check if type is valid for messenger search
];

module.exports = { searchValidationRules, messangerSearchValidationRules };
