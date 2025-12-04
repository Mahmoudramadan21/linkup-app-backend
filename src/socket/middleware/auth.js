// socket/middleware/auth.js
const jwt = require("jsonwebtoken");
const prisma = require("../../utils/prisma");
const redis = require("../../utils/redis");

/**
 * Socket.IO middleware to authenticate user via accessToken cookie
 */
const authSocketMiddleware = async (socket, next) => {
  const token = socket.request.cookies?.accessToken;

  if (!token) {
    return next(new Error("Authentication error: No token provided"));
  }

  // Check blacklist
  const isBlacklisted = await redis.get(`blacklist:access:${token}`);
  if (isBlacklisted) {
    return next(new Error("Authentication error: Token revoked"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { UserID: decoded.userId },
      select: { UserID: true, Username: true, IsBanned: true },
    });

    if (!user || user.IsBanned) {
      return next(new Error("Authentication error: Invalid user"));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Authentication error: Invalid token"));
  }
};

module.exports = authSocketMiddleware;