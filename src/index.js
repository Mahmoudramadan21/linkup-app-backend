// index.js
require("dotenv").config({ path: "../.env" });
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const routes = require("./routes/index.js");
const setupSwagger = require("./docs/swagger.js");
const { startRedisCleanup } = require("./utils/redisCleanup");
const { get, set, del } = require("./utils/redisUtils");
const app = express();
const httpServer = createServer(app);

// =============================
// Middleware
// =============================
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================
// CORS (Dynamic)
// =============================
const allowedOrigins = [
  "http://localhost:8000",
  "http://localhost:3000",
  "http://192.168.1.6:3000",
  "http://192.168.1.5:8000",
  "http://192.168.1.6:8000",
  "http://192.168.1.7:8000",
  "http://192.168.1.11:8000",
  "http://192.168.1.2:8000",
  "http://192.168.1.9:8000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// =============================
// Swagger
// =============================
setupSwagger(app);

// =============================
// Routes
// =============================
app.use("/api", routes);

// =============================
// Health Check
// =============================
app.get("/", (req, res) => {
  res.json({ status: "OK", message: "LinkUp Server is Running!" });
});

// =============================
// Global Error Handler
// =============================
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON format" });
  }
  console.error("Error:", err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// =============================
// Socket.IO Setup (No Redis, No Extra Files)
// =============================
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Simple JWT Auth Middleware for Socket
io.use(async (socket, next) => {
  let token =
    socket.handshake.headers.authToken ||
    socket.handshake.headers["authorization"]?.split(" ")[1] ||
    socket.handshake.auth?.token;

  // Try to extract from cookies
  if (!token && socket.handshake.headers.cookie) {
    const cookies = Object.fromEntries(
      socket.handshake.headers.cookie.split(";").map((c) => {
        const [key, value] = c.trim().split("=");
        return [key, decodeURIComponent(value)];
      })
    );
    token = cookies.accessToken;
  }

  if (!token) {
    return next(new Error("Authentication error: No token provided"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { UserID: decoded.userId },
      select: { UserID: true, Username: true, IsBanned: true },
    });

    if (!user || user.IsBanned) {
      return next(new Error("Authentication error: Invalid or banned user"));
    }

    socket.user = user;
    next();
  } catch (err) {
    console.error("Socket auth error:", err.message);
    next(new Error("Authentication error: Invalid token"));
  }
});

// Connection Handling
io.on("connection", (socket) => {
  const userId = socket.user.UserID;
  console.log(`User ${userId} connected via WebSocket`);

  // Join user's room
  socket.join(`user:${userId}`);

  // ===== Join conversation room =====
  socket.on("conversation:join", (roomName) => {
    if (typeof roomName !== "string") return;
    socket.join(roomName);
    console.log(`📥 User ${userId} joined room: ${roomName}`);
  });

  // ===== Leave conversation room =====
  socket.on("conversation:leave", (roomName) => {
    if (typeof roomName !== "string") return;
    socket.leave(roomName);
    console.log(`📤 User ${userId} left room: ${roomName}`);
  });

  socket.on("disconnect", () => {
    console.log(`User ${userId} disconnected`);
  });

  const typingTimestamps = new Map();

  socket.on("typing:start", ({ conversationId }) => {
    const key = `${socket.user.UserID}:${conversationId}`;
    const now = Date.now();

    if (typingTimestamps.get(key) && now - typingTimestamps.get(key) < 500)
      return;

    typingTimestamps.set(key, now);

    socket.to(`conversation:${conversationId}`).emit("typing", {
      conversationId,
      userId: socket.user.UserID,
      username: socket.user.Username,
      isTyping: true,
    });
  });

  socket.on("typing:stop", ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit("typing", {
      conversationId,
      userId: socket.user.UserID,
      username: socket.user.Username,
      isTyping: false,
    });
  });
});

// Make io accessible in controllers
app.set("io", io);

// =============================
// Background Jobs
// =============================
// startRedisCleanup();

// =============================
// Start Server
// =============================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Socket.IO ready (simple mode)`);
  console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
});
