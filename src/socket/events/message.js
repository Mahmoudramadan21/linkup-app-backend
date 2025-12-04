// socket/events/message.js
const prisma = require("../../utils/prisma");
const { decryptMessage, encryptMessage } = require("../../utils/encryption");

/**
 * Setup message-related events
 */
const setupMessageEvents = (io, socket) => {
  const userId = socket.user.UserID;

  // Send Message
  socket.on("message:send", async ({ conversationId, content, replyToId, attachment }, callback) => {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { Id: conversationId },
        select: { Participants: { select: { UserID: true } } },
      });

      if (!conversation?.Participants.some(p => p.UserID === userId)) {
        return callback({ error: "Access denied" });
      }

      const encryptedContent = content ? encryptMessage(content, conversationId) : null;

      const message = await prisma.message.create({
        data: {
          ConversationId: conversationId,
          SenderId: userId,
          Content: encryptedContent,
          ReplyToId: replyToId,
          Attachments: attachment ? { create: attachment } : undefined,
        },
        include: {
          Sender: { select: { UserID: true, Username: true, ProfilePicture: true } },
          Attachments: true,
          ReplyTo: { select: { Id: true, Content: true, SenderId: true, IsDeleted: true } },
        },
      });

      await prisma.conversation.update({
        where: { Id: conversationId },
        data: { LastMessageId: message.Id },
      });

      const decrypted = {
        ...message,
        Content: content,
      };

      // Emit to all participants
      conversation.Participants.forEach(p => {
        io.to(`user:${p.UserID}`).emit("message:new", {
          ...decrypted,
          status: p.UserID === userId ? "SENT" : "DELIVERED",
        });
      });

      callback({ success: true, message: decrypted });
    } catch (err) {
      callback({ error: "Failed to send message" });
    }
  });

  // Edit Message
  socket.on("message:edit", async ({ messageId, content }, callback) => {
    try {
      const msg = await prisma.message.findUnique({
        where: { Id: messageId },
        select: { SenderId: true, ConversationId: true, Content: true },
      });

      if (msg.SenderId !== userId) return callback({ error: "Unauthorized" });

      const encrypted = encryptMessage(content, msg.ConversationId);

      await prisma.$transaction(async (tx) => {
        await tx.messageEdit.create({
          data: { MessageId: messageId, OldContent: msg.Content, EditorId: userId },
        });
        await tx.message.update({
          where: { Id: messageId },
          data: { Content: encrypted, IsEdited: true },
        });
      });

      io.to(`conversation:${msg.ConversationId}`).emit("message:edited", {
        messageId,
        content,
        editedAt: new Date(),
      });

      callback({ success: true });
    } catch (err) {
      callback({ error: "Failed to edit" });
    }
  });

  // React to Message
  socket.on("message:react", async ({ messageId, emoji }, callback) => {
    try {
      const reaction = await prisma.reaction.upsert({
        where: { MessageId_UserId: { MessageId: messageId, UserId: userId } },
        update: { Emoji: emoji },
        create: { MessageId: messageId, UserId: userId, Emoji: emoji },
        include: { User: { select: { UserID: true, Username: true } } },
      });

      const msg = await prisma.message.findUnique({
        where: { Id: messageId },
        select: { ConversationId: true },
      });

      io.to(`conversation:${msg.ConversationId}`).emit("message:reacted", {
        messageId,
        reaction: { emoji, user: reaction.User },
      });

      callback({ success: true });
    } catch (err) {
      callback({ error: "Failed to react" });
    }
  });
};

module.exports = setupMessageEvents;