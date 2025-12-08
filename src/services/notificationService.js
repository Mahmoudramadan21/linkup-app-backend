const prisma = require("../utils/prisma");
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
        Metadata: metadata || {},
        SenderID: senderId,
      },
      include: {
        Sender: {
          select: {
            UserID: true,
            Username: true,
            ProfilePicture: true,
          },
        },
      },
    });

    logger.info(`Notification created for user ${userId} - Type: ${type}`);

    // Format notification exactly like getNotifications response
    const formattedNotification = {
      notification: {
        notificationId: notification.NotificationID,
        type: notification.Type,
        content: notification.Content,
        isRead: notification.IsRead,
        createdAt: notification.CreatedAt,
        sender: notification.Sender
          ? {
              userId: notification.Sender.UserID,
              username: notification.Sender.Username,
              profilePicture: notification.Sender.ProfilePicture,
            }
          : null,
        metadata: notification.Metadata,
      },
    };

    // 1. Send email if enabled
    const user = await prisma.user.findUnique({
      where: { UserID: userId },
      select: { NotificationPreferences: true, Email: true },
    });

    if (user?.NotificationPreferences?.EmailNotifications) {
      try {
        await emailService.sendNotificationEmail({
          userId,
          email: user.Email,
          type,
          content,
        });
      } catch (error) {
        logger.error(`Failed to send email notification: ${error.message}`);
      }
    }

    // 2. Emit REAL-TIME notification to the user
    if (io) {
      io.to(`user:${userId}`).emit("notification:new", formattedNotification);

      // 3. Also emit updated unread count
      const unreadCount = await getUnreadNotificationsCount(userId);
      io.to(`user:${userId}`).emit("unreadNotificationsCount", {
        count: unreadCount,
      });

      logger.info(`Real-time notification + count sent to user:${userId}`);
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
 */
async function getNotifications({
  userId,
  page = 1,
  limit = 20,
  readStatus = "ALL",
}) {
  try {
    const skip = (page - 1) * limit;
    const where = { UserID: userId };

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
      data: { IsRead: true },
    });

    // Emit updated count via Socket.IO
    if (io) {
      const newCount = await getUnreadNotificationsCount(userId);
      io.to(`user:${userId}`).emit("unreadNotificationsCount", {
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
 */
async function markAllNotificationsRead(userId) {
  try {
    await prisma.notification.updateMany({
      where: {
        UserID: userId,
        IsRead: false,
      },
      data: { IsRead: true },
    });

    if (io) {
      const newCount = await getUnreadNotificationsCount(userId);
      io.to(`user:${userId}`).emit("unreadNotificationsCount", {
        count: newCount,
      });
      logger.info(
        `Sent updated unread notifications count (all read) to user ${userId}: ${newCount}`
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

    // If the deleted notification was unread → update count
    if (!notification.IsRead && io) {
      const newCount = await getUnreadNotificationsCount(userId);
      io.to(`user:${userId}`).emit("unreadNotificationsCount", {
        count: newCount,
      });
      logger.info(
        `Sent updated unread count after deletion to user ${userId}: ${newCount}`
      );
    }
  } catch (error) {
    logger.error(
      `Error deleting notification ${notificationId} for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Updates a user's notification preferences
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
      select: { NotificationPreferences: true },
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
 * Gets the count of unread notifications for a user (directly from DB - no cache)
 */
async function getUnreadNotificationsCount(userId) {
  try {
    const count = await prisma.notification.count({
      where: {
        UserID: userId,
        IsRead: false,
      },
    });

    logger.info(
      `Fetched unread notifications count for user ${userId}: ${count}`
    );
    return count;
  } catch (error) {
    logger.error(
      `Error fetching unread notifications count for user ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Deletes all old FOLLOW_REQUEST notifications for a given user.
 */
async function deleteOldFollowRequests(userId) {
  try {
    await prisma.notification.deleteMany({
      where: {
        UserID: userId,
        Type: "FOLLOW_REQUEST",
      },
    });

    logger.info(`Deleted old FOLLOW_REQUEST notifications for user ${userId}`);
  } catch (error) {
    logger.error(`Failed to delete old follow requests: ${error.message}`);
    throw error;
  }
}

/**
 * Deletes notifications by IDs and emits real-time updates to the user
 * @param {number} userId - ID of the user who owns the notifications
 * @param {number[]} notificationIds - Array of notification IDs to delete
 */
async function deleteNotificationsAndEmit(userId, notificationIds) {
  try {
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return [];
    }

    // Delete notifications safely
    const deleted = await prisma.notification.deleteMany({
      where: {
        UserID: userId,
        NotificationID: { in: notificationIds },
      },
    });

    logger.info(
      `Deleted ${
        deleted.count
      } notifications for user ${userId}: [${notificationIds.join(", ")}]`
    );

    // Emit deleted notification IDs to frontend
    if (io && deleted.count > 0) {
      io.to(`user:${userId}`).emit("notification:deleted", {
        notificationIds,
      });

      // Update unread count after deletion
      const newCount = await getUnreadNotificationsCount(userId);
      io.to(`user:${userId}`).emit("unreadNotificationsCount", {
        count: newCount,
      });

      logger.info(
        `Emitted deleted notification IDs + updated unread count for user ${userId}`
      );
    }

    return notificationIds;
  } catch (error) {
    logger.error(
      `Error deleting notifications for user ${userId}: ${error.message}`
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
  deleteOldFollowRequests,
  deleteNotificationsAndEmit,
};
