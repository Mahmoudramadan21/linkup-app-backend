const { query, param, body } = require("express-validator");

const getNotificationsValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be an integer between 1 and 100"),
  query("readStatus")
    .optional()
    .isIn(["ALL", "READ", "UNREAD"])
    .withMessage("readStatus must be one of ALL, READ, UNREAD"),
];

const markNotificationAsReadValidator = [
  param("notificationId")
    .isInt({ min: 1 })
    .withMessage("notificationId must be a positive integer"),
];

const updateNotificationPreferencesValidator = [
  body("emailNotifications")
    .optional()
    .isBoolean()
    .withMessage("emailNotifications must be a boolean"),
  body("pushNotifications")
    .optional()
    .isBoolean()
    .withMessage("pushNotifications must be a boolean"),
  body("notificationTypes")
    .optional()
    .isArray()
    .withMessage("notificationTypes must be an array")
    .custom((value) => {
      const validTypes = [
        "LIKE",
        "COMMENT",
        "FOLLOW",
        "FOLLOW_REQUEST",
        "REPORT",
        "STORY_LIKE",
      ];
      return value.every((type) => validTypes.includes(type));
    })
    .withMessage(
      "notificationTypes must contain valid types: LIKE, COMMENT, FOLLOW, FOLLOW_REQUEST, REPORT, STORY_LIKE"
    ),
];

const deleteNotificationValidator = [
  param("notificationId")
    .isInt({ min: 1 })
    .withMessage("notificationId must be a positive integer"),
];

const getUnreadNotificationsCountValidator = [
  // No parameters needed since userId is taken from req.user.UserID
];

module.exports = {
  getNotificationsValidator,
  markNotificationAsReadValidator,
  updateNotificationPreferencesValidator,
  deleteNotificationValidator,
  getUnreadNotificationsCountValidator,
};
