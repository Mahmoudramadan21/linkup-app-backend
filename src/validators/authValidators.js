const { body } = require("express-validator");
const {
  validateUsername,
  validateEmail,
  validatePassword,
} = require("../utils/validators");

/**
 * Validation rules for user sign-up
 * Ensures all required fields meet specific criteria
 */
const signupValidationRules = [
  body("profileName")
    .notEmpty()
    .withMessage("Profile name is required")
    .isString()
    .isLength({ min: 2, max: 50 })
    .withMessage("Profile name must be between 2 and 50 characters")
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage("Profile name must contain only letters and spaces"),
  body("username")
    .notEmpty()
    .withMessage("Username is required")
    .custom(validateUsername)
    .withMessage(
      "Username must be 3-20 characters long and can only contain letters, numbers, and underscores."
    ),
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .custom(validateEmail)
    .withMessage("Please provide a valid email address"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .custom(validatePassword)
    .withMessage(
      "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character."
    ),
  body("gender")
    .notEmpty()
    .withMessage("Gender is required")
    .isIn(["MALE", "FEMALE", "OTHER"])
    .withMessage("Gender must be MALE, FEMALE, or OTHER"),
  body("dateOfBirth")
    .notEmpty()
    .withMessage("Date of birth is required")
    .isISO8601()
    .withMessage(
      "Date of birth must be a valid ISO 8601 date (e.g., YYYY-MM-DD)"
    )
    .custom((value) => {
      const dob = new Date(value);
      const today = new Date();
      const minAgeDate = new Date(
        today.getFullYear() - 13,
        today.getMonth(),
        today.getDate()
      );
      if (dob > minAgeDate) {
        throw new Error("You must be at least 13 years old to register");
      }
      return true;
    }),
];

/**
 * Validation rules for user login
 * Accepts either username or email, with password validation
 */
const loginValidationRules = [
  body("usernameOrEmail")
    .notEmpty()
    .withMessage("Username or email is required")
    .custom((value) => {
      if (!validateEmail(value) && !validateUsername(value)) {
        throw new Error("Invalid username or email format");
      }
      return true;
    }),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .custom((value) => {
      if (!validatePassword(value)) {
        throw new Error(
          "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character."
        );
      }
      return true;
    }),
];

/**
 * Validation rules for forgot password
 * Ensures email is provided and valid
 */
const forgotPasswordValidationRules = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address"),
];

/**
 * Validation rules for verifying the 4-digit code
 * Ensures email and code are provided and valid
 */
const verifyCodeValidationRules = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address"),
  body("code")
    .isString()
    .matches(/^[0-9]{4}$/)
    .withMessage("Verification code must be a 4-digit number"),
];

/**
 * Validation rules for resetting password with a temporary token
 * Ensures newPassword is provided and valid
 */
const resetPasswordValidationRules = [
  body("newPassword")
    .isString()
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long")
    .custom(validatePassword)
    .withMessage(
      "New password must include at least one uppercase letter, one lowercase letter, one number, and one special character."
    ),
];

module.exports = {
  signupValidationRules,
  loginValidationRules,
  forgotPasswordValidationRules,
  verifyCodeValidationRules,
  resetPasswordValidationRules,
};
