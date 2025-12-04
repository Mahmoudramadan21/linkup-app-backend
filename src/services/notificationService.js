const prisma = require("../utils/prisma");
const { setWithTracking, get, clearUserCache } = require("../utils/redisUtils");
const logger = require("../utils/logger");
const { handleServerError } = require("../utils/errorHandler");
const emailService = require("./emailService");

let io; // Socket.IO instance (to be injected)

// Inject Socket.IO instance
function setSocketInstance(socketIo) {
  io = socketIo;
}

/**
 * Creates a notification for a user and sends it via appropriate channels
 * @param {Object} params - Notification parameters
 * @param {number} params.userId - The ID of the user to notify
 * @param {string} params.type - Notification type (e.g., LIKE, COMMENT)
 * @param {string} params.content - Notification content
 * @param {Object} [params.metadata] - Additional metadata
 * @param {number} [params.senderId] - The ID of the sender (optional)
 * @returns {Promise<Object>} Created notification
 */
async function createNotification({
  userId,
  type,
  content,
  metadata,
  senderId,
}) {
  try {
    // Create notification in database
    const notification = await prisma.notification.create({
      data: {
        UserID: userId,
        Type: type,
        Content: content,
        Metadata: metadata,
        SenderID: senderId,
      },
    });

    // Increment unread notifications count in Redis
    const cacheKey = `unread_notifications_count:${userId}`;
    await setWithTracking(
      cacheKey,
      (await getUnreadNotificationsCount(userId)) + 1,
      300,
      userId
    );
    logger.info(`Incremented unread notifications count for user ${userId}`);

    // Send email notification if enabled
    const user = await prisma.user.findUnique({
      where: { UserID: userId },
      select: { NotificationPreferences: true },
    });

    if (user?.NotificationPreferences?.EmailNotifications) {
      try {
        await emailService.sendNotificationEmail({
          userId,
          type,
          content,
        });
        logger.info(`Email notification sent to user ${userId}`);
      } catch (error) {
        logger.error(
          `Failed to send email notification to user ${userId}: ${error.message}`
        );
      }
    }

    // Emit updated unread notifications count via Socket.IO if user is online
    if (io) {
      const unreadCount = await getUnreadNotificationsCount(userId);
      io.to(`user_${userId}`).emit("unreadNotificationsCount", {
        count: unreadCount,
      });
      logger.info(
        `Sent updated unread notifications count to user ${userId}: ${unreadCount}`
      );
    }

    return notification;
  } catch (error) {
    logger.error(
      `Error creating notification for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Gets notifications for a user with pagination
 * @param {Object} params - Query parameters
 * @param {number} params.userId - The ID of the user
 * @param {number} [params.page=1] - Page number
 * @param {number} [params.limit=20] - Number of notifications per page
 * @param {string} [params.readStatus="ALL"] - Filter by read status (ALL, READ, UNREAD)
 * @returns {Promise<Object>} Notifications and pagination info
 */
async function getNotifications({
  userId,
  page = 1,
  limit = 20,
  readStatus = "ALL",
}) {
  try {
    const cacheKey = `notifications:${userId}:${page}:${limit}:${readStatus}`;
    const cachedNotifications = await get(cacheKey);
    if (cachedNotifications) {
      logger.info(`Retrieved notifications from cache for user ${userId}`);
      return cachedNotifications;
    }

    const skip = (page - 1) * limit;
    const where = {
      UserID: userId,
    };

    if (readStatus === "READ") {
      where.IsRead = true;
    } else if (readStatus === "UNREAD") {
      where.IsRead = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { CreatedAt: "desc" },
        include: {
          Sender: {
            select: {
              UserID: true,
              Username: true,
              ProfilePicture: true,
            },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    const response = {
      notifications: notifications.map((n) => ({
        notificationId: n.NotificationID,
        type: n.Type,
        content: n.Content,
        isRead: n.IsRead,
        createdAt: n.CreatedAt,
        sender: n.Sender
          ? {
              userId: n.Sender.UserID,
              username: n.Sender.Username,
              profilePicture: n.Sender.ProfilePicture,
            }
          : null,
        metadata: n.Metadata,
      })),
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    };

    await setWithTracking(cacheKey, response, 300, userId);
    logger.info(`Cached notifications for user ${userId}`);

    return response;
  } catch (error) {
    logger.error(
      `Error fetching notifications for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Marks notifications as read
 * @param {number} userId - The ID of the user
 * @param {number[]} notificationIds - Array of notification IDs to mark as read
 * @returns {Promise<void>}
 */
async function markNotificationsRead(userId, notificationIds) {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        NotificationID: { in: notificationIds },
        UserID: userId,
      },
      select: { NotificationID: true },
    });

    if (notifications.length !== notificationIds.length) {
      throw new Error("Some notifications not found or unauthorized");
    }

    await prisma.notification.updateMany({
      where: {
        NotificationID: { in: notificationIds },
        UserID: userId,
      },
      data: {
        IsRead: true,
      },
    });

    // Update unread notifications count in Redis
    const cacheKey = `unread_notifications_count:${userId}`;
    const newCount = await getUnreadNotificationsCount(userId);
    await setWithTracking(cacheKey, newCount, 300, userId);
    logger.info(
      `Updated unread notifications count for user ${userId}: ${newCount}`
    );

    // Clear notifications cache
    await clearUserCache(userId);

    // Emit updated unread notifications count via Socket.IO
    if (io) {
      io.to(`user_${userId}`).emit("unreadNotificationsCount", {
        count: newCount,
      });
      logger.info(
        `Sent updated unread notifications count to user ${userId}: ${newCount}`
      );
    }
  } catch (error) {
    logger.error(
      `Error marking notifications as read for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Marks all notifications as read for a user
 * @param {number} userId - The ID of the user
 * @returns {Promise<void>}
 */
async function markAllNotificationsRead(userId) {
  try {
    await prisma.notification.updateMany({
      where: {
        UserID: userId,
        IsRead: false,
      },
      data: {
        IsRead: true,
      },
    });

    // Update unread notifications count in Redis
    const cacheKey = `unread_notifications_count:${userId}`;
    const newCount = await getUnreadNotificationsCount(userId);
    await setWithTracking(cacheKey, newCount, 300, userId);
    logger.info(
      `Updated unread notifications count for user ${userId}: ${newCount}`
    );

    // Clear notifications cache
    await clearUserCache(userId);

    // Emit updated unread notifications count via Socket.IO
    if (io) {
      io.to(`user_${userId}`).emit("unreadNotificationsCount", {
        count: newCount,
      });
      logger.info(
        `Sent updated unread notifications count to user ${userId}: ${newCount}`
      );
    }
  } catch (error) {
    logger.error(
      `Error marking all notifications as read for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Deletes a notification
 * @param {number} userId - The ID of the user
 * @param {number} notificationId - The ID of the notification to delete
 * @returns {Promise<void>}
 */
async function deleteNotification(userId, notificationId) {
  try {
    const notification = await prisma.notification.findUnique({
      where: { NotificationID: notificationId },
      select: { UserID: true, IsRead: true },
    });

    if (!notification || notification.UserID !== userId) {
      throw new Error("Notification not found or unauthorized");
    }

    await prisma.notification.delete({
      where: { NotificationID: notificationId },
    });

    // Update unread notifications count in Redis if the notification was unread
    if (!notification.IsRead) {
      const cacheKey = `unread_notifications_count:${userId}`;
      const newCount = await getUnreadNotificationsCount(userId);
      await setWithTracking(cacheKey, newCount, 300, userId);
      logger.info(
        `Updated unread notifications count for user ${userId}: ${newCount}`
      );

      // Emit updated unread notifications count via Socket.IO
      if (io) {
        io.to(`user_${userId}`).emit("unreadNotificationsCount", {
          count: newCount,
        });
        logger.info(
          `Sent updated unread notifications count to user ${userId}: ${newCount}`
        );
      }
    }

    // Clear notifications cache
    await clearUserCache(userId);
  } catch (error) {
    logger.error(
      `Error deleting notification ${notificationId} for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Updates a user's notification preferences
 * @param {number} userId - The ID of the user
 * @param {Object} preferences - Notification preferences
 * @returns {Promise<Object>} Updated preferences
 */
async function updateNotificationPreferences(userId, preferences) {
  try {
    const updatedUser = await prisma.user.update({
      where: { UserID: userId },
      data: {
        NotificationPreferences: {
          upsert: {
            create: preferences,
            update: preferences,
          },
        },
      },
      select: {
        NotificationPreferences: true,
      },
    });

    logger.info(`Updated notification preferences for user ${userId}`);
    return updatedUser.NotificationPreferences;
  } catch (error) {
    logger.error(
      `Error updating notification preferences for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Gets the count of unread notifications for a user
 * @param {number} userId - The ID of the user
 * @returns {Promise<number>} The count of unread notifications
 */
async function getUnreadNotificationsCount(userId) {
  try {
    // Check Redis cache first
    const cacheKey = `unread_notifications_count:${userId}`;
    const cachedCount = await get(cacheKey);
    if (cachedCount !== null) {
      logger.info(
        `Retrieved unread notifications count from cache for user ${userId}: ${cachedCount}`
      );
      return parseInt(cachedCount);
    }

    // Query Prisma for unread notifications count
    const count = await prisma.notification.count({
      where: {
        UserID: userId,
        IsRead: false,
      },
    });

    // Cache the result in Redis for 5 minutes
    await setWithTracking(cacheKey, count, 300, userId);
    logger.info(
      `Fetched and cached unread notifications count for user ${userId}: ${count}`
    );

    return count;
  } catch (error) {
    logger.error(
      `Error fetching unread notifications count for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

module.exports = {
  setSocketInstance,
  createNotification,
  getNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotification,
  updateNotificationPreferences,
  getUnreadNotificationsCount,
};
