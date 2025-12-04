const NotificationService = require("../services/notificationService");
const { handleServerError } = require("../utils/errorHandler");
const logger = require("../utils/logger");

// Constants for configuration
const DEFAULT_PAGE_SIZE = 20;

/**
 * Fetches notifications for the authenticated user
 * Supports pagination and filtering by read status
 */
const getNotifications = async (req, res) => {
  try {
    const { page = 1, readStatus = "ALL" } = req.query;
    const userId = req.user.UserID;
    const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;

    // Validate readStatus
    const validStatuses = ["ALL", "READ", "UNREAD"];
    if (!validStatuses.includes(readStatus)) {
      return res.status(400).json({ error: "Invalid read status" });
    }

    const response = await NotificationService.getNotifications({
      userId,
      page: parseInt(page),
      limit,
      readStatus,
    });

    res.json({
      notifications: response.notifications,
      totalCount: response.total,
      page: response.currentPage,
      totalPages: response.pages,
    });
  } catch (error) {
    logger.error(
      `Error fetching notifications for user ${req.user.UserID}: ${error.message}`
    );
    handleServerError(res, error, "Failed to fetch notifications");
  }
};

/**
 * Marks a single notification as read
 */
const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.UserID;

    await NotificationService.markNotificationsRead(userId, [
      parseInt(notificationId),
    ]);
    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    logger.error(
      `Error marking notification as read for user ${req.user.UserID}: ${error.message}`
    );
    handleServerError(res, error, "Failed to mark notification as read");
  }
};

/**
 * Marks all notifications as read for the user
 */
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.UserID;

    await NotificationService.markAllNotificationsRead(userId);
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    logger.error(
      `Error marking all notifications as read for user ${req.user.UserID}: ${error.message}`
    );
    handleServerError(res, error, "Failed to mark all notifications as read");
  }
};

/**
 * Updates user notification preferences
 */
const updateNotificationPreferences = async (req, res) => {
  try {
    const { emailNotifications, pushNotifications, notificationTypes } =
      req.body;
    const userId = req.user.UserID;

    // Validate notification types
    const validTypes = [
      "LIKE",
      "COMMENT",
      "FOLLOW",
      "FOLLOW_REQUEST",
      "REPORT",
      "STORY_LIKE",
    ];
    if (
      (notificationTypes && !Array.isArray(notificationTypes)) ||
      (notificationTypes &&
        notificationTypes.some((type) => !validTypes.includes(type)))
    ) {
      return res.status(400).json({ error: "Invalid notification types" });
    }

    const preferences = {
      EmailNotifications: emailNotifications,
      PushNotifications: pushNotifications,
      NotificationTypes: notificationTypes,
    };

    const updatedPreferences =
      await NotificationService.updateNotificationPreferences(
        userId,
        preferences
      );

    res.json({
      success: true,
      preferences: updatedPreferences,
    });
  } catch (error) {
    logger.error(
      `Error updating notification preferences for user ${req.user.UserID}: ${error.message}`
    );
    handleServerError(res, error, "Failed to update notification preferences");
  }
};

/**
 * Deletes a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.UserID;

    await NotificationService.deleteNotification(
      userId,
      parseInt(notificationId)
    );
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    logger.error(
      `Error deleting notification for user ${req.user.UserID}: ${error.message}`
    );
    handleServerError(res, error, "Failed to delete notification");
  }
};

/**
 * Gets the count of unread notifications for a user
 */
const getUnreadNotificationsCount = async (req, res) => {
  try {
    const userId = req.user.UserID;
    const count = await NotificationService.getUnreadNotificationsCount(userId);
    logger.info(
      `Fetched unread notifications count for user ${userId}: ${count}`
    );
    res.json({ count });
  } catch (error) {
    logger.error(
      `Error fetching unread notifications count for user ${req.user.UserID}: ${error.message}`
    );
    handleServerError(res, error, "Failed to fetch unread notifications count");
  }
};

module.exports = {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  updateNotificationPreferences,
  deleteNotification,
  getUnreadNotificationsCount,
};
