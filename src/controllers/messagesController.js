/**
 * @file messagesController.js
 * @description Handles all chat & messaging logic with E2EE, rate limiting, infinite scroll, and REAL-TIME updates via WebSocket.
 */

const prisma = require("../utils/prisma");
const { del } = require("../utils/redisUtils");
const { handleServerError } = require("../utils/errorHandler");
const { uploadToCloud } = require("../services/cloudService");
const { encryptMessage, decryptMessage } = require("../utils/encryption");
const { generateLinkPreview } = require("../services/linkPreviewService");
const rateLimit = require("express-rate-limit");

// Rate limiting: 30 messages per 15 seconds per user
const messageRateLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 30,
  keyGenerator: (req) => `msg:${req.user.UserID}`,
  handler: (req, res) =>
    res.status(429).json({ error: "Too many messages. Please slow down." }),
});

/**
 * Helper: Emit message to all participants
 */
const emitMessageToParticipants = (io, conversationId, message, senderId, status = "SENT") => {
  prisma.conversation
    .findUnique({
      where: { Id: conversationId },
      select: { Participants: { select: { UserID: true } } },
    })
    .then((conv) => {
      if (!conv) return;

      const payload = {
        ...message,
        Content: message.Content,
        status: status === "SENT" && message.SenderId === senderId ? "SENT" : "DELIVERED",
      };

      conv.Participants.forEach((p) => {
        io.to(`user:${p.UserID}`).emit("message:new", payload);
      });
    })
    .catch(console.error);
};

/**
 * Get user conversations with optimized N+1 avoidance
 */
const getConversations = async (req, res) => {
  const { UserID } = req.user;
  const { page = 1, limit = 15 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const conversations = await prisma.conversation.findMany({
      where: { Participants: { some: { UserID } } },
      skip,
      take: parseInt(limit),
      orderBy: { UpdatedAt: "desc" },
      select: {
        Id: true,
        UpdatedAt: true,
        LastMessage: {
          select: {
            Id: true,
            Content: true,
            CreatedAt: true,
            SenderId: true,
            IsDeleted: true,
            Attachments: {
              select: { Type: true },
            },
          },
        },
        Participants: {
          where: { UserID: { not: UserID } },
          select: {
            UserID: true,
            Username: true,
            ProfilePicture: true,
            LastActive: true,
          },
          take: 1,
        },
        _count: {
          select: {
            Messages: {
              where: {
                SenderId: { not: UserID },
                Status: { not: "READ" },
                IsDeleted: false,
              },
            },
          },
        },
      },
    });

    const total = await prisma.conversation.count({
      where: { Participants: { some: { UserID } } },
    });

    const formatted = conversations.map((c) => {
      let content = null;

      if (c.LastMessage) {
        if (c.LastMessage.IsDeleted) {
          content = "Message deleted";
        } else if (
          c.LastMessage.Attachments &&
          c.LastMessage.Attachments.length > 0
        ) {
          const type = c.LastMessage.Attachments[0].Type;
          // content = type === "IMAGE" ? "Image" : type === "VIDEO" ? "Video" : "Attachment";
          content = type === "IMAGE"
            ? "Image"
            : type === "VIDEO"
            ? "Video"
            : type === "VOICE"
            ? "Voice message"
            : "Attachment";
        } else {
          content = decryptMessage(c.LastMessage.Content, c.Id);
        }
      }

      return {
        conversationId: c.Id,
        lastMessage: c.LastMessage
          ? {
              id: c.LastMessage.Id,
              content,
              createdAt: c.LastMessage.CreatedAt,
              senderId: c.LastMessage.SenderId,
            }
          : null,
        unreadCount: c._count.Messages,
        otherParticipant: c.Participants[0] || null,
        updatedAt: c.UpdatedAt,
      };
    });

    // Emit conversation list update (optional)
    req.app.get("io").to(`user:${UserID}`).emit("conversations:updated", {
      conversations: formatted,
      total,
    });

    res.json({
      conversations: formatted,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    handleServerError(res, error, "Failed to fetch conversations");
  }
};

/**
 * Start or get existing conversation
 */
const startConversation = async (req, res) => {
  const { UserID } = req.user;
  const { participantId } = req.body;
  const io = req.app.get("io");

  try {
    const participant = await prisma.user.findUnique({
      where: { UserID: participantId },
      select: { UserID: true, Username: true, ProfilePicture: true, IsBanned: true },
    });

    if (!participant || participant.IsBanned) {
      return res.status(400).json({ error: "Invalid or banned user" });
    }

    if (participantId === UserID) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          { Participants: { some: { UserID } } },
          { Participants: { some: { UserID: participantId } } },
        ],
      },
      include: {
        Participants: {
          select: { UserID: true, Username: true, ProfilePicture: true },
        },
      },
    });

    
    /**
     * Helper to format conversation data
     */
    const formatConversation = (conversation) => ({
      conversationId: conversation.Id,
      participants: conversation.Participants
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          Participants: {
            connect: [{ UserID }, { UserID: participantId }],
          },
        },
        include: {
          Participants: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
        },
      });

      await del(`conversations:${UserID}`);
      await del(`conversations:${participantId}`);

      // ---- Format conversation once ----
      const formatted = formatConversation(conversation);

      // Notify both users
      io.to(`user:${UserID}`).emit("conversation:created", formatted);
      io.to(`user:${participantId}`).emit("conversation:created", formatted);
    }

    // ---- If conversation already exists ----
    const formatted = formatConversation(conversation);
    res.json(formatted);
  } catch (error) {
    handleServerError(res, error, "Failed to start conversation");
  }
};

/**
 * Get messages with infinite scroll
 */
const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const { limit = 20, before } = req.query;
  const userId = req.user.UserID;
  const io = req.app.get("io");

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { Id: conversationId },
      select: { Participants: { select: { UserID: true } } },
    });

    if (!conversation || !conversation.Participants.some((p) => p.UserID === userId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const where = {
      ConversationId: conversationId,
      CreatedAt: before ? { lt: new Date(before) } : undefined,
    };

    const messages = await prisma.message.findMany({
      where,
      take: parseInt(limit),
      orderBy: { CreatedAt: "desc" },
      include: {
        Sender: { select: { UserID: true, Username: true, ProfilePicture: true } },
        Attachments: true,
        Reactions: { include: { User: { select: { UserID: true, Username: true } } } },
        ReadBy: { select: { UserID: true } },
        ReplyTo: { select: { Id: true, Content: true, SenderId: true, IsDeleted: true } },
      },
    });

    const decrypted = await Promise.all(
      messages.map(async (msg) => {
        const decryptedContent = msg.Content
          ? !msg.IsDeleted
            ? decryptMessage(msg.Content, conversationId)
            : "Message deleted"
          : null;

        let decryptedReplyContent = null;
        if (msg.ReplyTo && msg.ReplyTo.Content && !msg.ReplyTo.IsDeleted) {
          decryptedReplyContent = decryptMessage(msg.ReplyTo.Content, conversationId);
        } else if (msg.ReplyTo?.IsDeleted) {
          decryptedReplyContent = "Message deleted";
        }

        let storyReference = null;
        if (msg.Metadata?.storyReference) {
          const { storyId, mediaUrl, expiresAt } = msg.Metadata.storyReference;
          const story = await prisma.story.findUnique({
            where: { StoryID: storyId },
            select: { User: true, ExpiresAt: true },
          });
          const isExpired = story ? new Date(story.ExpiresAt) < new Date() : true;
          storyReference = {
            storyId,
            userId: story?.User?.UserID,
            username: story?.User?.Username,
            mediaUrl: isExpired ? null : mediaUrl,
            expiresAt: isExpired ? null : expiresAt,
            isExpired,
          };
        }

        const { Metadata, ...rest } = msg;
        return {
          ...rest,
          Content: decryptedContent,
          ReplyTo: msg.ReplyTo
            ? { ...msg.ReplyTo, Content: decryptedReplyContent, }
            : null,
          storyReference,
        };
      })
    );

    // Mark as read
    await prisma.message.updateMany({
      where: {
        ConversationId: conversationId,
        SenderId: { not: userId },
        Status: { not: "READ" },
      },
      data: { Status: "READ", ReadAt: new Date() },
    });

    // Emit read status
    io.to(`conversation:${conversationId}`).emit("messages:read", { userId, conversationId });

    res.json({
      messages: decrypted.reverse(),
      hasMore: messages.length === parseInt(limit),
    });
  } catch (error) {
    handleServerError(res, error, "Failed to fetch messages");
  }
};

/**
 * Send message (with real-time broadcast)
 */
const sendMessage = async (req, res) => {
  const { conversationId } = req.params;
  const { content, replyToId } = req.body;
  const userId = req.user.UserID;
  const io = req.app.get("io");
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { Id: conversationId },
      select: { Participants: { select: { UserID: true } } },
    });
    if (!conversation || !conversation.Participants.some((p) => p.UserID === userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    let attachment = null;
    if (req.file) {
      const mime = req.file.mimetype;
      let resourceType = "auto";
      let type = "FILE";
      if (mime.startsWith("image/")) {
        resourceType = "image";
        type = "IMAGE";
      } else if (mime.startsWith("video/") || mime.startsWith("audio/")) {
        resourceType = "video";
        type = mime.startsWith("audio/") ? "VOICE" : "VIDEO";
      } else if (mime === "application/pdf") {
        resourceType = "raw";
        type = "FILE";
      } else {
        resourceType = "raw";
        type = "FILE";
      }
      const uploadResult = await uploadToCloud(req.file.buffer, {
        folder: `messages/${userId}`,
        resource_type: resourceType,
      });
      attachment = {
        Url: uploadResult.secure_url,
        Type: type,
        FileName: req.file.originalname,
        FileSize: req.file.size,
      };
    }
    const encryptedContent = content ? encryptMessage(content, conversationId) : null;
    const message = await prisma.$transaction(
      async (tx) => {
        const msg = await tx.message.create({
          data: {
            ConversationId: conversationId,
            SenderId: userId,
            Content: encryptedContent,
            ReplyToId: replyToId,
            Attachments: attachment ? { create: attachment } : undefined,
          },
          include: {
            Attachments: true,
            Sender: { select: { UserID: true, Username: true, ProfilePicture: true } },
          },
        });
        await tx.conversation.update({
          where: { Id: conversationId },
          data: { LastMessageId: msg.Id, UpdatedAt: new Date() },
        });
        return msg;
      },
      { timeout: 15000 }
    );

    // Format the message similarly to getMessages
    let replyTo = null;
    if (replyToId) {
      const replyMsg = await prisma.message.findUnique({
        where: { Id: replyToId },
        select: { Id: true, Content: true, SenderId: true, IsDeleted: true },
      });
      if (replyMsg) {
        let decryptedReplyContent = null;
        if (replyMsg.Content && !replyMsg.IsDeleted) {
          decryptedReplyContent = decryptMessage(replyMsg.Content, conversationId);
        } else if (replyMsg.IsDeleted) {
          decryptedReplyContent = "Message deleted";
        }
        replyTo = {
          Id: replyMsg.Id,
          Content: decryptedReplyContent,
          SenderId: replyMsg.SenderId,
          IsDeleted: replyMsg.IsDeleted,
        };
      }
    }
    

    const formattedMessage = {
      Id: message.Id,
      ConversationId: message.ConversationId,
      SenderId: message.SenderId,
      Content: content ? (!message.IsDeleted ? content : "Message deleted") : null,
      Status: message.Status || "SENT",
      ReadAt: message.ReadAt,
      ReplyToId: message.ReplyToId,
      CreatedAt: message.CreatedAt,
      UpdatedAt: message.UpdatedAt,
      IsEdited: message.IsEdited,
      IsDeleted: message.IsDeleted,
      DeletedAt: message.DeletedAt,
      Sender: message.Sender,
      Attachments: message.Attachments,
      Reactions: [],
      ReadBy: [],
      ReplyTo: replyTo,
      storyReference: null,
    };

    // Emit real-time to all participants (using formatted message for consistency)
    // emitMessageToParticipants(io, conversationId, formattedMessage, userId);
    emitMessageToParticipants(io, conversationId, formattedMessage, userId);

    res.status(201).json(formattedMessage);
  } catch (error) {
    handleServerError(res, error, "Failed to send message");
  }
};

/**
 * Reply to story (with real-time)
 */
const replyToStory = async (req, res) => {
  const { UserID: senderId } = req.user;
  const { storyId, content } = req.body;
  const io = req.app.get("io");

  try {
    const story = await prisma.story.findUnique({
      where: { StoryID: parseInt(storyId) },
      select: {
        StoryID: true,
        UserID: true,
        MediaURL: true,
        ExpiresAt: true,
        User: { select: { Username: true, IsBanned: true } },
      },
    });

    if (!story || new Date(story.ExpiresAt) < new Date()) {
      return res.status(400).json({ error: "Story not found or expired" });
    }

    if (story.User.IsBanned || story.UserID === senderId) {
      return res.status(403).json({ error: "Cannot reply" });
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          { Participants: { some: { UserID: senderId } } },
          { Participants: { some: { UserID: story.UserID } } },
        ],
      },
    });

    let isNewConversation = false;
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          Participants: {
            connect: [{ UserID: senderId }, { UserID: story.UserID }],
          },
        },
      });
      isNewConversation = true;
      await del(`conversations:${senderId}`);
      await del(`conversations:${story.UserID}`);
    }

    const encryptedContent = content ? encryptMessage(content, conversation.Id) : null;

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          ConversationId: conversation.Id,
          SenderId: senderId,
          Content: encryptedContent,
          Metadata: {
            storyReference: {
              storyId: story.StoryID,
              mediaUrl: story.MediaURL,
              expiresAt: story.ExpiresAt.toISOString(),
            },
          },
        },
        include: { Sender: { select: { UserID: true, Username: true } } },
      });

      await tx.conversation.update({
        where: { Id: conversation.Id },
        data: { LastMessageId: msg.Id, UpdatedAt: new Date() },
      });

      return msg;
    });

    // Notification
    await prisma.notification.create({
      data: {
        UserID: story.UserID,
        SenderID: senderId,
        Type: "MESSAGE",
        Content: `${req.user.Username} replied to your story`,
        Metadata: { conversationId: conversation.Id, isStoryReply: true, storyId: story.StoryID },
      },
    });

    io.to(`user:${story.UserID}`).emit("notification:new", {
      type: "STORY_REPLY",
      message: `${req.user.Username} replied to your story`,
      data: { conversationId: conversation.Id, storyId: story.StoryID },
    });

    const formattedMessage = {
      message: { ...message, Content: content },
      conversationId: conversation.Id,
      isNewConversation,
      storyPreview: { StoryID: story.StoryID, MediaURL: story.MediaURL, ExpiresAt: story.ExpiresAt },
    }

    const formattedMessagePayload = {
      Id: message.Id,
      ConversationId: message.ConversationId,
      SenderId: message.SenderId,
      Content: content,
      Status: message.Status || "SENT",
      ReadAt: message.ReadAt,
      ReplyToId: message.ReplyToId,
      CreatedAt: message.CreatedAt,
      UpdatedAt: message.UpdatedAt,
      IsEdited: message.IsEdited,
      IsDeleted: message.IsDeleted,
      DeletedAt: message.DeletedAt,
      Sender: message.Sender,
      Attachments: message.Attachments,
      Reactions: [],
      ReadBy: [],
      ReplyTo: null,
      storyReference: {
        storyId: story.StoryID,
        userId: story.UserID,
        username: story.User.Username,
        mediaUrl: story.MediaURL,
        expiresAt: story.ExpiresAt,
        isExpired: false,
      },
    };

    // Emit real-time
    emitMessageToParticipants(io, conversation.Id, formattedMessagePayload, senderId);

    res.status(201).json(formattedMessage);
  } catch (error) {
    handleServerError(res, error, "Failed to reply to story");
  }
};

/**
 * Edit message (real-time)
 */
const editMessage = async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;
  const userId = req.user.UserID;
  const io = req.app.get("io");

  try {
    const message = await prisma.message.findUnique({
      where: { Id: messageId },
      select: { SenderId: true, ConversationId: true, Content: true, IsDeleted: true },
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.SenderId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (message.IsDeleted) {
      return res.status(400).json({ error: "Cannot edit a deleted message" });
    }

    const encrypted = encryptMessage(content, message.ConversationId);

    await prisma.$transaction(async (tx) => {
      await tx.messageEdit.create({
        data: { MessageId: messageId, OldContent: message.Content, EditorId: userId },
      });
      await tx.message.update({
        where: { Id: messageId },
        data: { Content: encrypted, IsEdited: true, UpdatedAt: new Date() },
      });
    });

    io.to(`conversation:${message.ConversationId}`).emit("message:edited", {
      messageId,
      conversationId: message.ConversationId,
      content,
      editedAt: new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    handleServerError(res, error);
  }
};

/**
 * Delete message (real-time)
 */
const deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.UserID;
  const io = req.app.get("io");

  try {
    const message = await prisma.message.findUnique({
      where: { Id: messageId },
      select: { SenderId: true, ConversationId: true },
    });

    if (!message || message.SenderId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { Id: messageId },
        data: { IsDeleted: true, DeletedAt: new Date() },
      });
      await tx.messageDelete.create({
        data: { MessageId: messageId, DeletedBy: userId },
      });
    });

    io.to(`conversation:${message.ConversationId}`).emit("message:deleted", {
      messageId, 
      conversationId: message.ConversationId,
     });

    res.json({ success: true });
  } catch (error) {
    handleServerError(res, error);
  }
};

/**
 * Search messages
 */
const searchMessages = async (req, res) => {
  const { conversationId } = req.params;
  const { q, limit = 20 } = req.query;
  const userId = req.user.UserID;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { Id: conversationId },
      select: { Participants: { select: { UserID: true } } },
    });

    if (!conversation || !conversation.Participants.some((p) => p.UserID === userId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const messages = await prisma.message.findMany({
      where: {
        ConversationId: conversationId,
        Content: { contains: q, mode: "insensitive" },
        IsDeleted: false,
      },
      take: parseInt(limit),
      orderBy: { CreatedAt: "desc" },
      select: { Id: true, Content: true, CreatedAt: true, SenderId: true },
    });

    const decrypted = messages.map((m) => ({
      ...m,
      Content: decryptMessage(m.Content, conversationId),
    }));

    res.json({ results: decrypted });
  } catch (error) {
    handleServerError(res, error);
  }
};

// controllers/messageController.js

/**
 * Search conversations by participant name/username
 */
const searchConversations = async (req, res) => {
  const { UserID } = req.user;
  const { q, page = 1, limit = 15 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const searchTerm = q.trim();

  if (!searchTerm) {
    return res.status(400).json({ error: "Search query is required" });
  }

  try {
    // First: Get all conversation IDs where user is a participant
    const userConversations = await prisma.conversation.findMany({
      where: { Participants: { some: { UserID } } },
      select: { Id: true },
    });

    const conversationIds = userConversations.map((c) => c.Id);

    if (conversationIds.length === 0) {
      return res.json({
        conversations: [],
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        query: searchTerm,
      });
    }

    // Search participants (exclude current user) using ILIKE for case-insensitive
    const participants = await prisma.user.findMany({
      where: {
        AND: [
          { UserID: { not: UserID } },
          {
            OR: [
              { Username: { contains: searchTerm, mode: "insensitive" } },
              { ProfileName: { contains: searchTerm, mode: "insensitive" } },
            ],
          },
          {
            Conversations: {
              some: {
                Id: { in: conversationIds },
              },
            },
          },
        ],
      },
      select: {
        UserID: true,
        Username: true,
        ProfilePicture: true,
        LastActive: true,
        Conversations: {
          where: { Id: { in: conversationIds } },
          select: {
            Id: true,
            UpdatedAt: true,
            LastMessage: {
              select: {
                Id: true,
                Content: true,
                CreatedAt: true,
                SenderId: true,
                IsDeleted: true,
                Attachments: { select: { Type: true } },
              },
            },
            _count: {
              select: {
                Messages: {
                  where: {
                    SenderId: { not: UserID },
                    Status: { not: "READ" },
                    IsDeleted: false,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { Conversations: { _count: "desc" } }, // prioritize active chats
    });

    // Flatten: one conversation per participant
    const formatted = [];
    const seenConvIds = new Set();

    for (const participant of participants) {
      for (const conv of participant.Conversations) {
        if (seenConvIds.has(conv.Id)) continue;
        seenConvIds.add(conv.Id);

        let content = null;
        if (conv.LastMessage) {
          if (conv.LastMessage.IsDeleted) {
            content = "Message deleted";
          } else if (conv.LastMessage.Attachments?.length > 0) {
            const type = conv.LastMessage.Attachments[0].Type;
            content = type === "IMAGE" ? "Image" : type === "VIDEO" ? "Video" : "Attachment";
          } else {
            content = decryptMessage(conv.LastMessage.Content, conv.Id);
          }
        }

        formatted.push({
          conversationId: conv.Id,
          lastMessage: conv.LastMessage
            ? {
                id: conv.LastMessage.Id,
                content,
                createdAt: conv.LastMessage.CreatedAt,
                senderId: conv.LastMessage.SenderId,
              }
            : null,
          unreadCount: conv._count.Messages,
          otherParticipant: {
            UserID: participant.UserID,
            Username: participant.Username,
            ProfilePicture: participant.ProfilePicture,
            LastActive: participant.LastActive,
          },
          updatedAt: conv.UpdatedAt,
        });
      }
    }

    // Apply pagination on formatted results
    const paginated = formatted.slice(skip, skip + parseInt(limit));
    const total = formatted.length;

    // Optional: Emit search results update (for real-time search-as-you-type)
    const io = req.app.get("io");
    io.to(`user:${UserID}`).emit("conversations:search", {
      query: searchTerm,
      results: paginated,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      conversations: paginated,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      query: searchTerm,
    });
  } catch (error) {
    handleServerError(res, error, "Failed to search conversations");
  }
};

module.exports = {
  getConversations,
  startConversation,
  getMessages,
  sendMessage,
  replyToStory,
  editMessage,
  deleteMessage,
  searchMessages,
  searchConversations,
  messageRateLimiter,
};