const express = require("express");
const router = express.Router();
const {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  updateNotificationPreferences,
  deleteNotification,
  getUnreadNotificationsCount,
} = require("../controllers/notificationController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validationMiddleware");
const {
  getNotificationsValidator,
  markNotificationAsReadValidator,
  updateNotificationPreferencesValidator,
  deleteNotificationValidator,
  getUnreadNotificationsCountValidator,
} = require("../validators/notificationValidator");

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Notification management endpoints
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Fetch user notifications
 *     tags: [Notifications]
 *     description: Retrieves notifications for the authenticated user with pagination and optional read status filtering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of notifications per page
 *       - in: query
 *         name: readStatus
 *         schema:
 *           type: string
 *           enum: [ALL, READ, UNREAD]
 *           default: ALL
 *         description: Filter notifications by read status
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       notificationId:
 *                         type: integer
 *                       type:
 *                         type: string
 *                       content:
 *                         type: string
 *                       isRead:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       sender:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           userId:
 *                             type: integer
 *                           username:
 *                             type: string
 *                           profilePicture:
 *                             type: string
 *                       metadata:
 *                         type: object
 *                 totalCount:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/", getNotificationsValidator, validate, getNotifications);

/**
 * @swagger
 * /notifications/{notificationId}/read:
 *   put:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     description: Marks a specific notification as read for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the notification
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       403:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 */
router.put(
  "/:notificationId/read",
  markNotificationAsReadValidator,
  validate,
  markNotificationAsRead
);

/**
 * @swagger
 * /notifications/read:
 *   put:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     description: Marks all notifications as read for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */
router.put("/read", markAllNotificationsAsRead);

/**
 * @swagger
 * /notifications/preferences:
 *   put:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     description: Updates the notification preferences for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNotifications:
 *                 type: boolean
 *                 description: Enable or disable email notifications
 *               pushNotifications:
 *                 type: boolean
 *                 description: Enable or disable push notifications
 *               notificationTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [LIKE, COMMENT, FOLLOW, FOLLOW_REQUEST, REPORT, STORY_LIKE]
 *                 description: List of allowed notification types
 *           example:
 *             emailNotifications: true
 *             pushNotifications: false
 *             notificationTypes: ["LIKE", "COMMENT", "STORY_LIKE"]
 *     responses:
 *       200:
 *         description: Notification preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 preferences:
 *                   type: object
 *                   properties:
 *                     EmailNotifications:
 *                       type: boolean
 *                     PushNotifications:
 *                       type: boolean
 *                     NotificationTypes:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put(
  "/preferences",
  updateNotificationPreferencesValidator,
  validate,
  updateNotificationPreferences
);

/**
 * @swagger
 * /notifications/{notificationId}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     description: Deletes a specific notification for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the notification
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       403:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         $ref: '#/components/responses/ErrorResponse'
 */
router.delete(
  "/:notificationId",
  deleteNotificationValidator,
  validate,
  deleteNotification
);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get unread notifications count
 *     tags: [Notifications]
 *     description: Retrieves the count of unread notifications for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notifications count retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ErrorResponse'
 */
router.get(
  "/unread-count",
  getUnreadNotificationsCountValidator,
  validate,
  getUnreadNotificationsCount
);

module.exports = router;
