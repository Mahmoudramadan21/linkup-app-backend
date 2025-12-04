// socket/events/story.js
const prisma = require("../../utils/prisma");
const { encryptMessage } = require("../../utils/encryption");

/**
 * Setup real-time story reply events
 * - User replies to a story → message appears in chat with preview
 * - Both users get real-time update
 * - Auto-creates conversation if needed
 */
const setupStoryEvents = (io, socket) => {
  const userId = socket.user.UserID;
  const username = socket.user.Username;

  /**
   * Event: reply to a story
   * Emits: new message + notification to story owner
   */
  socket.on("story:reply", async ({ storyId, content }, callback) => {
    let conversation = null;
    let isNewConversation = false;
    let story = null;
    let message = null;

    try {
      // 1. Fetch story with owner
      story = await prisma.story.findUnique({
        where: { StoryID: parseInt(storyId) },
        select: {
          StoryID: true,
          UserID: true,
          MediaURL: true,
          ExpiresAt: true,
          User: { select: { Username: true, IsBanned: true } },
        },
      });

      if (!story) {
        return callback({ error: "Story not found" });
      }

      if (new Date(story.ExpiresAt) < new Date()) {
        return callback({ error: "Story has expired" });
      }

      if (story.User.IsBanned) {
        return callback({ error: "Cannot reply to banned user" });
      }

      if (story.UserID === userId) {
        return callback({ error: "Cannot reply to your own story" });
      }

      // 2. Find or create conversation
      conversation = await prisma.conversation.findFirst({
        where: {
          AND: [
            { Participants: { some: { UserID: userId } } },
            { Participants: { some: { UserID: story.UserID } } },
          ],
        },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            Participants: {
              connect: [{ UserID: userId }, { UserID: story.UserID }],
            },
          },
        });
        isNewConversation = true;

        // Invalidate cached conversations
        await prisma.$executeRaw`DELETE FROM redis WHERE key LIKE 'conversations:${userId}'`;
        await prisma.$executeRaw`DELETE FROM redis WHERE key LIKE 'conversations:${story.UserID}'`;
      }

      // 3. Create message with story reference
      const encryptedContent = content ? encryptMessage(content, conversation.Id) : null;

      message = await prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            ConversationId: conversation.Id,
            SenderId: userId,
            Content: encryptedContent,
            Metadata: {
              storyReference: {
                storyId: story.StoryID,
                mediaUrl: story.MediaURL,
                expiresAt: story.ExpiresAt.toISOString(),
              },
            },
          },
          include: {
            Sender: { select: { UserID: true, Username: true, ProfilePicture: true } },
          },
        });

        await tx.conversation.update({
          where: { Id: conversation.Id },
          data: { LastMessageId: msg.Id, UpdatedAt: new Date() },
        });

        return msg;
      });

      // 4. Prepare decrypted payload
      const payload = {
        ...message,
        Content: content || null,
        storyReference: {
          storyId: story.StoryID,
          mediaUrl: story.MediaURL,
          expiresAt: story.ExpiresAt.toISOString(),
          isExpired: false,
        },
      };

      // 5. Emit to both users (sender & receiver)
      const receiverRoom = `user:${story.UserID}`;
      const senderRoom = `user:${userId}`;

      io.to(receiverRoom).emit("message:new", {
        ...payload,
        status: "DELIVERED",
      });

      io.to(senderRoom).emit("message:new", {
        ...payload,
        status: "SENT",
      });

      // 6. Send notification to story owner
      io.to(receiverRoom).emit("notification:new", {
        type: "STORY_REPLY",
        title: `${username} replied to your story`,
        body: content || "Sent a photo",
        data: {
          conversationId: conversation.Id,
          storyId: story.StoryID,
        },
        timestamp: new Date().toISOString(),
      });

      // 7. Create DB notification
      await prisma.notification.create({
        data: {
          UserID: story.UserID,
          SenderID: userId,
          Type: "MESSAGE",
          Content: `${username} replied to your story`,
          Metadata: {
            conversationId: conversation.Id,
            isStoryReply: true,
            storyId: story.StoryID,
          },
        },
      });

      // 8. Respond to sender
      callback({
        success: true,
        data: {
          message: payload,
          conversationId: conversation.Id,
          isNewConversation,
          storyPreview: {
            StoryID: story.StoryID,
            MediaURL: story.MediaURL,
            ExpiresAt: story.ExpiresAt,
          },
        },
      });
    } catch (error) {
      console.error("Story reply error:", error);
      callback({ error: "Failed to reply to story" });
    }
  });
};

module.exports = setupStoryEvents;