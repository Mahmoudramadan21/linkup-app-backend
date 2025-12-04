// socket/events/status.js
const prisma = require("../../utils/prisma");

const setupStatusEvents = (io, socket) => {
  const userId = socket.user.UserID;

  // Broadcast online
  socket.broadcast.emit("user:online", { userId });

  // Update last active
  prisma.user.update({
    where: { UserID: userId },
    data: { LastActive: new Date() },
  });

  socket.on("disconnect", () => {
    socket.broadcast.emit("user:offline", { userId });
  });
};

module.exports = setupStatusEvents;