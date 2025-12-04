const { Server } = require("socket.io");
const prisma = require("./utils/prisma");
const { verifyToken } = require("./middleware/authMiddleware");
const NotificationService = require("./services/notificationService");
const logger = require("./utils/logger");
const { handleServerError } = require("./utils/errorHandler");

// Configure Socket.IO and inject into NotificationService
const configureSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3001",
      methods: ["GET", "POST"],
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  // Inject Socket.IO instance into NotificationService
  NotificationService.setSocketInstance(io);

  io.use(async (socket, next) => {
    try {
      // Extract token from cookies in handshake headers
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        return next(new Error("Authentication error: No cookies provided"));
      }

      const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split("=");
        acc[name] = value;
        return acc;
      }, {});

      const token = cookies.accessToken;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { UserID: decoded.userId },
        select: {
          UserID: true,
          Username: true,
          ProfilePicture: true,
          lastActive: true,
        },
      });

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      socket.user = user;
      next();
    } catch (err) {
      logger.error("Socket auth error:", err.message);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.user.UserID;
    logger.info(`User connected: ${socket.user.Username} (ID: ${userId})`);

    socket.join(`user_${userId}`);

    try {
      // Update user's last active status
      await prisma.user.update({
        where: { UserID: userId },
        data: { lastActive: new Date() },
      });

      // Get and send unread notifications count
      const unreadCount = await NotificationService.getUnreadNotificationsCount(
        userId
      );
      socket.emit("unreadNotificationsCount", { count: unreadCount });
      logger.info(
        `Sent unread notifications count to user ${userId}: ${unreadCount}`
      );

      // Broadcast user status
      socket.broadcast.emit("userStatus", {
        userId,
        status: "online",
        username: socket.user.Username,
        lastActive: new Date(),
      });

      // Join user's conversations
      const conversations = await prisma.conversation.findMany({
        where: { participants: { some: { UserID: userId } } },
        select: { id: true },
      });

      conversations.forEach((conv) => {
        socket.join(conv.id);
        logger.info(`User ${userId} joined conversation ${conv.id}`);
      });
    } catch (error) {
      logger.error(
        `Error during socket connection for user ${userId}: ${error.message}`
      );
      socket.emit("error", { message: "Failed to initialize connection" });
    }

    socket.on("typing", async ({ conversationId, isTyping }) => {
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { participants: { select: { UserID: true } } },
        });

        if (
          !conversation ||
          !conversation.participants.some((p) => p.UserID === userId)
        ) {
          logger.warn(
            `User ${userId} attempted to send typing event to unauthorized conversation ${conversationId}`
          );
          return;
        }

        socket.to(conversationId).emit("typing", {
          userId,
          isTyping,
          username: socket.user.Username,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error("Error handling typing event:", error);
      }
    });

    socket.on("markRead", async ({ messageIds }) => {
      try {
        await prisma.message.updateMany({
          where: { id: { in: messageIds } },
          data: { readAt: new Date() },
        });

        const messages = await prisma.message.findMany({
          where: { id: { in: messageIds } },
          select: { senderId: true, conversationId: true },
        });

        messages.forEach((msg) => {
          if (msg.senderId !== userId) {
            io.to(`user_${msg.senderId}`).emit("messagesRead", {
              conversationId: msg.conversationId,
              readerId: userId,
              timestamp: new Date(),
            });
          }
        });

        // Update unread notifications count after marking messages as read
        const unreadCount =
          await NotificationService.getUnreadNotificationsCount(userId);
        socket.emit("unreadNotificationsCount", { count: unreadCount });
        logger.info(
          `Updated unread notifications count for user ${userId}: ${unreadCount}`
        );
      } catch (error) {
        logger.error("Read receipt error:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });

    socket.on("disconnect", async () => {
      logger.info(`User disconnected: ${socket.user.Username} (ID: ${userId})`);
      try {
        await prisma.user.update({
          where: { UserID: userId },
          data: { lastActive: new Date() },
        });

        socket.broadcast.emit("userStatus", {
          userId,
          status: "offline",
          username: socket.user.Username,
          lastActive: new Date(),
        });
      } catch (error) {
        logger.error("Error updating last active:", error);
      }
    });
  });

  return io;
};

module.exports = configureSocket;