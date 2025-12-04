// socket/events/typing.js
const setupTypingEvents = (io, socket) => {
  const userId = socket.user.UserID;

  socket.on("typing:start", ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit("typing:start", { userId });
  });

  socket.on("typing:stop", ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit("typing:stop", { userId });
  });
};

module.exports = setupTypingEvents;