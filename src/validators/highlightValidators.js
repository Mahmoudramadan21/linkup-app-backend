const { validateHighlightTitle } = require("../utils/validators");
const { body } = require("express-validator");

/**
 * Validation rules for creating a new highlight
 * Ensures title, cover image, and story IDs meet requirements
 * @returns {Array} Express-validator middleware array
 */
const validateHighlightInput = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .bail()
    .custom(validateHighlightTitle)
    .withMessage("Title must be 2-50 characters"),

  body("coverImage").custom((_, { req }) => {
    const files = req.files || {};
    const coverImageFile = files.coverImage ? files.coverImage[0] : null;

    if (!coverImageFile) {
      throw new Error("Cover image file is required");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(coverImageFile.mimetype)) {
      throw new Error("Invalid media type. Only JPEG, PNG, WebP allowed");
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (coverImageFile.size > maxSize) {
      throw new Error("Media file too large. Maximum size is 5MB");
    }

    return true;
  }),

  body("storyIds")
    .custom((value) => {
      let ids = value;
      if (typeof value === "string") {
        ids = value
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
      }
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20) {
        throw new Error("Must include 1-20 stories");
      }
      if (!ids.every((id) => /^\d+$/.test(id))) {
        throw new Error("Invalid story ID");
      }
      return true;
    })
    .customSanitizer((value) => {
      if (typeof value === "string") {
        return value
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
      }
      return value;
    }),

  body("storyIds.*").isInt({ min: 1 }).withMessage("Invalid story ID").toInt(),
];

/**
 * Validation rules for updating an existing highlight
 * Allows optional updates to title, cover image, and story IDs
 * @returns {Array} Express-validator middleware array
 */
const validateHighlightUpdate = [
  body("title")
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage("Title cannot be empty")
    .bail()
    .custom(validateHighlightTitle)
    .withMessage("Title must be 2-50 characters"),

  body("coverImage")
    .optional()
    .custom((_, { req }) => {
      const files = req.files || {};
      const coverImageFile = files.coverImage ? files.coverImage[0] : null;

      if (!coverImageFile) {
        return true; // Optional
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(coverImageFile.mimetype)) {
        throw new Error("Invalid media type. Only JPEG, PNG, WebP allowed");
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (coverImageFile.size > maxSize) {
        throw new Error("Media file too large. Maximum size is 5MB");
      }

      return true;
    }),

  body("storyIds")
    .optional({ checkFalsy: true })
    .custom((value) => {
      let ids = value;
      if (typeof value === "string") {
        ids = value
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
      }
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20) {
        throw new Error("Must include 1-20 stories");
      }
      if (!ids.every((id) => /^\d+$/.test(id))) {
        throw new Error("Invalid story ID");
      }
      return true;
    })
    .customSanitizer((value) => {
      if (typeof value === "string") {
        return value
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
      }
      return value;
    }),

  body("storyIds.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid story ID")
    .toInt(),
];

module.exports = {
  validateHighlightInput,
  validateHighlightUpdate,
};
