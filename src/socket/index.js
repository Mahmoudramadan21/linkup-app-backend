// socket/index.js
const { Server } = require("socket.io");
const { pubClient, subClient } = require("../utils/redis");
const authSocketMiddleware = require("./middleware/auth");
const setupMessageEvents = require("./events/message");
const setupTypingEvents = require("./events/typing");
const setupStatusEvents = require("./events/status");
const setupStoryEvents = require("./events/story");

/**
 * Initialize Socket.IO with Redis Adapter for horizontal scaling
 * @param {http.Server} httpServer
 * @returns {Server}
 */
const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:8000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  // Middleware: Authenticate user via accessToken cookie
  io.use(authSocketMiddleware);

  // Connection handling
  io.on("connection", (socket) => {
    const userId = socket.user.UserID;
    console.log(`User ${userId} connected via WebSocket`);

    // Join user's personal room for direct messages
    socket.join(`user:${userId}`);

    // Setup event handlers
    setupMessageEvents(io, socket);
    setupTypingEvents(io, socket);
    setupStatusEvents(io, socket);
    setupStoryEvents(io, socket);

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      console.log(`User ${userId} disconnected: ${reason}`);
      // Broadcast offline status
      socket.to(`user:${userId}`).emit("user:offline", { userId });
    });
  });

  return io;
};

module.exports = initializeSocket;