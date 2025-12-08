const NotificationService = require("../services/notificationService");
const logger = require("../utils/logger");
const prisma = require("../utils/prisma");
const {
  setWithTracking,
  get,
  clearUserCache,
  del,
} = require("../utils/redisUtils");
const { uploadToCloud } = require("../services/cloudService");
const { handleServerError } = require("../utils/errorHandler");
const redis = require("../utils/redis"); // Ensure Redis is imported

/**
 * Creates a new story with media
 * Expires after 24 hours
 */
const createStory = async (req, res) => {
  try {
    const { UserID } = req.user;
    const mediaFile = req.file;

    if (!mediaFile) {
      return res.status(400).json({ error: "Media file is required" });
    }

    const uploadResult = await uploadToCloud(mediaFile.buffer, {
      folder: "stories",
      resource_type: "auto",
      allowed_formats: ["jpg", "jpeg", "png", "webp", "webm", "mp4", "mov"],
    });

    if (!uploadResult?.secure_url) {
      throw new Error("No secure URL received from Cloudinary");
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const story = await prisma.story.create({
      data: {
        MediaURL: uploadResult.secure_url,
        ExpiresAt: expiresAt,
        User: { connect: { UserID } },
      },
      select: {
        StoryID: true,
        MediaURL: true,
        CreatedAt: true,
        ExpiresAt: true,
      },
    });

    const formatStory = (story) => ({
      storyId: story.StoryID,
      mediaUrl: story.MediaURL,
      createdAt: story.CreatedAt,
      expiresAt: story.ExpiresAt,
    });

    await del(`stories:${UserID}`, UserID);
    await del(`stories:feed:${UserID}`, UserID);

    // Notify via WebSocket
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${UserID}`).emit("storyUpdate", {
        storyId: story.StoryID,
        action: "new",
      });
    }

    res.status(201).json({ story: formatStory(story) });
  } catch (error) {
    handleServerError(res, error, "Failed to create story");
  }
};

/**
 * Fetches stories for a user by username
 * Includes privacy checks and returns active stories with user info,
 * story IDs, view/like status, and latest viewers
 */
const getUserStories = async (req, res) => {
  const { username } = req.params;
  const currentUserId = req.user?.UserID;

  try {
    if (!currentUserId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const cacheKey = `stories:username:${username}:viewer:${currentUserId}`;
    const cachedStories = await get(cacheKey);
    if (cachedStories) return res.json(cachedStories);

    // Get user
    const user = await prisma.user.findUnique({
      where: { Username: username },
      select: {
        UserID: true,
        Username: true,
        ProfilePicture: true,
        ProfileName: true,
        IsPrivate: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check privacy
    if (user.IsPrivate && user.UserID !== currentUserId) {
      const isFollowed = await prisma.follower.count({
        where: {
          UserID: user.UserID,
          FollowerUserID: currentUserId,
          Status: "ACCEPTED",
        },
      });
      if (!isFollowed) {
        return res.status(403).json({ error: "Private account" });
      }
    }

    // Fetch stories
    const stories = await prisma.story.findMany({
      where: {
        UserID: user.UserID,
        ExpiresAt: { gt: new Date() },
      },
      include: {
        StoryLikes: {
          where: { UserID: currentUserId }, // current user like status
          select: { LikeID: true },
        },
        _count: {
          select: { StoryLikes: true, StoryViews: true },
        },
        StoryViews: {
          where: { UserID: { not: currentUserId } },
          orderBy: { ViewedAt: "asc" },
          take: 100, // fetch enough for prioritization
          select: {
            ViewedAt: true,
            User: {
              select: {
                UserID: true,
                Username: true,
                ProfileName: true,
                ProfilePicture: true,
              },
            },
          },
        },
      },
      orderBy: { CreatedAt: "asc" },
    });

    if (!stories || stories.length === 0) {
      return res.json([]);
    }

    const storyIds = stories.map((s) => s.StoryID);

    // Views by current user
    const viewsByCurrentUser = await prisma.storyView.findMany({
      where: { StoryID: { in: storyIds }, UserID: currentUserId },
      select: { StoryID: true },
    });
    const viewedSet = new Set(viewsByCurrentUser.map((v) => v.StoryID));

    // Likes for prioritization
    const viewerLikes =
      storyIds.length > 0
        ? await prisma.storyLike.findMany({
            where: { StoryID: { in: storyIds } },
            select: { StoryID: true, UserID: true },
          })
        : [];

    const likedUserIdsByStory = viewerLikes.reduce((acc, like) => {
      if (!acc[like.StoryID]) acc[like.StoryID] = new Set();
      acc[like.StoryID].add(like.UserID);
      return acc;
    }, {});

    // Prioritize viewers
    const prioritizeViewers = (viewers, storyId) => {
      return (viewers || [])
        .filter((v) => v.User && v.User.UserID !== currentUserId)
        .sort((a, b) => {
          const aId = a.User.UserID;
          const bId = b.User.UserID;

          const isALiked =
            likedUserIdsByStory[storyId] &&
            likedUserIdsByStory[storyId].has(aId);
          const isBLiked =
            likedUserIdsByStory[storyId] &&
            likedUserIdsByStory[storyId].has(bId);

          // likers first
          if (isALiked && !isBLiked) return -1;
          if (!isALiked && isBLiked) return 1;

          // recent view
          return new Date(b.ViewedAt) - new Date(a.ViewedAt);
        })
        .slice(0, 6)
        .map((v) => {
          const uid = v.User.UserID;
          return {
            userId: uid,
            username: v.User.Username,
            profileName: v.User.ProfileName,
            profilePicture: v.User.ProfilePicture,
            isFollowed: false, // could add check if you want
            viewedAt: v.ViewedAt.toISOString(),
            isLiked:
              likedUserIdsByStory[storyId] &&
              likedUserIdsByStory[storyId].has(uid),
          };
        });
    };

    // Format response like getStoryFeed
    const formattedUser = {
      userId: user.UserID,
      username: user.Username,
      profileName: user.ProfileName,
      profilePicture: user.ProfilePicture,
      hasUnviewedStories:
        stories.filter((s) => viewedSet.has(s.StoryID)).length < stories.length,
      stories: stories.map((story) => {
        const isViewed = viewedSet.has(story.StoryID);
        const isLiked = story.StoryLikes.length > 0;

        const adjustedViewCount =
          story.UserID === currentUserId && isViewed
            ? story._count.StoryViews - 1
            : story._count.StoryViews;

        const adjustedLikeCount =
          story.UserID === currentUserId && isLiked
            ? story._count.StoryLikes - 1
            : story._count.StoryLikes;

        const isMine = story.UserID === currentUserId;

        const storyResponse = {
          storyId: story.StoryID,
          createdAt: story.CreatedAt,
          mediaUrl: story.MediaURL,
          expiresAt: story.ExpiresAt,
          isViewed,
          isLiked,
          isMine: isMine,
        };

        if (isMine) {
          storyResponse.likeCount = adjustedLikeCount;
          storyResponse.viewCount = adjustedViewCount;
          storyResponse.latestViewers = prioritizeViewers(
            story.StoryViews,
            story.StoryID
          );
        }

        return storyResponse;
      }),
    };

    await setWithTracking(cacheKey, formattedUser, 60, user.UserID.toString());
    res.json(formattedUser);
  } catch (error) {
    console.error("Error in getUserStories:", error);
    handleServerError(res, error, "Failed to fetch stories");
  }
};

/**
 * Fetches views and likes for a story
 * Requires ownership
 */
const getStoryViews = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.UserID;

    const story = await prisma.story.findUnique({
      where: { StoryID: parseInt(storyId) },
      select: { UserID: true },
    });

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    if (story.UserID !== userId) {
      return res.status(403).json({ error: "You don't own this story" });
    }

    const views = await prisma.storyView.findMany({
      where: { StoryID: parseInt(storyId) },
      include: {
        User: {
          select: { UserID: true, Username: true, ProfilePicture: true },
        },
      },
      orderBy: { ViewedAt: "asc" },
    });

    const likes = await prisma.storyLike.findMany({
      where: { StoryID: parseInt(storyId) },
      include: {
        User: {
          select: { UserID: true, Username: true, ProfilePicture: true },
        },
      },
      orderBy: { CreatedAt: "desc" },
    });

    res.status(200).json({
      totalViews: views.length,
      views,
      totalLikes: likes.length,
      likedBy: likes.map((like) => like.User),
    });
  } catch (error) {
    handleServerError(res, error, "Failed to fetch story views");
  }
};

/**
 * Fetches story feed for the current user and their followings.
 * - Paginates by number of users, not raw stories
 * - Includes user details, story IDs, and view/like status
 * - Ensures the current user's stories always appear first
 * - Prioritizes users with unviewed stories over fully viewed ones
 * - For each story, returns up to 6 latest viewers with priority: likers first, then followed users, then others (excluding self)
 * - Viewer response includes userId, username, profileName, profilePicture, isFollowed, viewedAt, and isLiked
 * - View count excludes self-view if viewed (decremented by 1 for current user's stories)
 * - Like count excludes self-like if liked (for own stories)
 * - Uses caching for performance optimization
 */
const getStoryFeed = async (req, res) => {
  const { UserID } = req.user;
  const { limit = 20, offset = 0 } = req.query;

  try {
    if (!UserID) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const cacheKey = `stories:feed:${UserID}:${offset}:${limit}:v10`;
    const cachedData = await get(cacheKey);
    if (cachedData) return res.json(cachedData);

    // Fetch followings
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: UserID, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);
    followingIds.push(UserID);

    // Step 1: get distinct users who have active stories (paginate users here)
    const activeUsers = await prisma.story.findMany({
      where: {
        UserID: { in: followingIds },
        ExpiresAt: { gt: new Date() },
      },
      distinct: ["UserID"],
      orderBy: { CreatedAt: "asc" },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
      select: { UserID: true },
    });

    const limitedUserIds = activeUsers.map((u) => u.UserID);
    if (limitedUserIds.length === 0) return res.json([]);

    // Step 2: fetch stories for those users
    const stories = await prisma.story.findMany({
      where: {
        UserID: { in: limitedUserIds },
        ExpiresAt: { gt: new Date() },
      },
      include: {
        User: {
          select: { Username: true, ProfilePicture: true, ProfileName: true },
        },
        StoryLikes: {
          where: { UserID },
          select: { LikeID: true },
        },
        _count: {
          select: { StoryLikes: true, StoryViews: true },
        },
        StoryViews: {
          where: { UserID: { not: UserID } },
          orderBy: { ViewedAt: "desc" },
          take: 100,
          select: {
            ViewedAt: true,
            User: {
              select: {
                UserID: true,
                Username: true,
                ProfileName: true,
                ProfilePicture: true,
              },
            },
          },
        },
      },
      orderBy: { CreatedAt: "asc" },
    });

    if (!stories || stories.length === 0) return res.json([]);

    const storyIds = stories.map((s) => s.StoryID);

    // Views by current user
    const viewsByCurrentUser = await prisma.storyView.findMany({
      where: { StoryID: { in: storyIds }, UserID },
      select: { StoryID: true },
    });
    const viewedSet = new Set(viewsByCurrentUser.map((v) => v.StoryID));

    // Likes (to detect likers in prioritization)
    const viewerLikes =
      storyIds.length > 0
        ? await prisma.storyLike.findMany({
            where: { StoryID: { in: storyIds } },
            select: { StoryID: true, UserID: true },
          })
        : [];

    const likedUserIdsByStory = viewerLikes.reduce((acc, like) => {
      const sid = like.StoryID;
      if (!acc[sid]) acc[sid] = new Set();
      acc[sid].add(like.UserID);
      return acc;
    }, {});

    // Prioritize viewers: likers > followed users > others > recent
    const prioritizeViewers = (viewers, followingIds, storyId) => {
      return (viewers || [])
        .filter((v) => v.User && v.User.UserID !== UserID)
        .sort((a, b) => {
          const aId = a.User.UserID;
          const bId = b.User.UserID;
          const isALiked = likedUserIdsByStory[storyId]?.has(aId) ?? false;
          const isBLiked = likedUserIdsByStory[storyId]?.has(bId) ?? false;
          const isAFollowed = followingIds.includes(aId);
          const isBFollowed = followingIds.includes(bId);

          if (isALiked && !isBLiked) return -1;
          if (!isALiked && isBLiked) return 1;
          if (isAFollowed && !isBFollowed) return -1;
          if (!isAFollowed && isBFollowed) return 1;

          return new Date(b.ViewedAt) - new Date(a.ViewedAt);
        })
        .slice(0, 6)
        .map((v) => {
          const uid = v.User.UserID;
          return {
            userId: uid,
            username: v.User.Username,
            profileName: v.User.ProfileName,
            profilePicture: v.User.ProfilePicture,
            isFollowed: followingIds.includes(uid),
            viewedAt: v.ViewedAt.toISOString(),
            isLiked: likedUserIdsByStory[storyId]?.has(uid) ?? false,
          };
        });
    };

    // Group stories by user
    const usersWithStories = stories.reduce((acc, story) => {
      if (!acc[story.UserID]) {
        acc[story.UserID] = {
          userId: story.UserID,
          username: story.User.Username,
          profilePicture: story.User.ProfilePicture,
          stories: [],
        };
      }

      const isViewed = viewedSet.has(story.StoryID);
      const isLiked = story.StoryLikes.length > 0;
      const totalViews = story._count.StoryViews;
      const totalLikes = story._count.StoryLikes;

      const adjustedViewCount =
        story.UserID === UserID && isViewed ? totalViews - 1 : totalViews;
      const adjustedLikeCount =
        story.UserID === UserID && isLiked ? totalLikes - 1 : totalLikes;

      const prioritizedViewers = prioritizeViewers(
        story.StoryViews,
        followingIds,
        story.StoryID
      );

      const isMine = story.UserID === UserID;

      const storyData = {
        storyId: story.StoryID,
        createdAt: story.CreatedAt,
        mediaUrl: story.MediaURL,
        expiresAt: story.ExpiresAt,
        isViewed,
        isLiked,
        isMine: isMine,
      };

      if (isMine) {
        storyData.likeCount = adjustedLikeCount;
        storyData.viewCount = adjustedViewCount;
        storyData.latestViewers = prioritizeViewers(
          story.StoryViews,
          followingIds,
          story.StoryID
        );
      }

      acc[story.UserID].stories.push(storyData);

      return acc;
    }, {});

    // Final response
    let result = Object.values(usersWithStories).map((user) => {
      const totalStories = user.stories.length;
      const viewedStories = user.stories.filter((s) => s.isViewed).length;
      return {
        userId: user.userId,
        username: user.username,
        profilePicture: user.profilePicture,
        hasUnviewedStories: viewedStories < totalStories,
        stories: user.stories,
      };
    });

    // Sort: current user first, then unviewed, then viewed
    result = result.sort((a, b) => {
      if (a.userId === UserID) return -1;
      if (b.userId === UserID) return 1;
      if (a.hasUnviewedStories && !b.hasUnviewedStories) return -1;
      if (!a.hasUnviewedStories && b.hasUnviewedStories) return 1;
      return 0;
    });

    await setWithTracking(cacheKey, result, 60, UserID);
    res.json(result);
  } catch (error) {
    console.error("Error in getStoryFeed:", error);
    handleServerError(res, error, "Failed to fetch story feed");
  }
};

/**
 * Fetches a specific story
 * Records view for non-owners
 */
const getStoryById = async (req, res) => {
  const { storyId } = req.params;
  const { UserID } = req.user;

  try {
    if (!UserID) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Fetch the story with necessary details
    const story = await prisma.story.findUnique({
      where: { StoryID: parseInt(storyId) },
      select: {
        StoryID: true,
        MediaURL: true,
        CreatedAt: true,
        ExpiresAt: true,
        UserID: true,
        User: {
          select: {
            UserID: true,
            Username: true,
            ProfileName: true,
            ProfilePicture: true,
            IsPrivate: true,
          },
        },
        _count: { select: { StoryLikes: true, StoryViews: true } },
        StoryViews: {
          where: { UserID: { not: UserID } },
          orderBy: { ViewedAt: "desc" },
          take: 100,
          select: {
            ViewedAt: true,
            User: {
              select: {
                UserID: true,
                Username: true,
                ProfileName: true,
                ProfilePicture: true,
              },
            },
          },
        },
        StoryLikes: {
          where: { UserID },
          select: { LikeID: true },
        },
      },
    });

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    if (story.ExpiresAt < new Date()) {
      return res.status(404).json({ error: "Story has expired" });
    }

    // Check privacy for non-owner
    if (story.User.IsPrivate && story.User.UserID !== UserID) {
      const isFollowed = await prisma.follower.count({
        where: {
          UserID: story.User.UserID,
          FollowerUserID: UserID,
          Status: "ACCEPTED",
        },
      });
      if (!isFollowed) {
        return res.status(403).json({ error: "Private account" });
      }
    }

    // Record view for non-owner
    if (story.User.UserID !== UserID) {
      const viewKey = `view:temp:${story.StoryID}:${UserID}`;
      await redis.set(viewKey, "1", "EX", 5);
      if (!global.viewBatch) {
        global.viewBatch = [];
        setInterval(async () => {
          const batch = global.viewBatch;
          global.viewBatch = [];
          if (batch.length) {
            await prisma.storyView.createMany({
              data: batch.map(({ storyId, userId }) => ({
                StoryID: parseInt(storyId),
                UserID: userId,
                ViewedAt: new Date(),
              })),
              skipDuplicates: true,
            });
            await Promise.all(
              batch.map(({ storyId, userId }) =>
                del(`stories:feed:${userId}`, userId)
              )
            );
          }
        }, 5000);
      }
      global.viewBatch.push({ storyId, userId: UserID });
      await del(`stories:feed:${UserID}`, UserID);
    }

    // Fetch following IDs for viewer prioritization
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: UserID, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    // Fetch all likes for this story to prioritize viewers
    const viewerLikes = await prisma.storyLike.findMany({
      where: { StoryID: parseInt(storyId) },
      select: { UserID: true },
    });
    const likedUserIds = new Set(viewerLikes.map((like) => like.UserID));

    // Check if viewed by current user
    const isViewed =
      (await prisma.storyView.count({
        where: { StoryID: parseInt(storyId), UserID },
      })) > 0;

    // Prioritize viewers: likers > followed users > others > recent
    const prioritizeViewers = (viewers, followingIds, storyId) => {
      return (viewers || [])
        .filter((v) => v.User && v.User.UserID !== UserID)
        .sort((a, b) => {
          const aId = a.User.UserID;
          const bId = b.User.UserID;
          const isALiked = likedUserIds.has(aId);
          const isBLiked = likedUserIds.has(bId);
          const isAFollowed = followingIds.includes(aId);
          const isBFollowed = followingIds.includes(bId);

          if (isALiked && !isBLiked) return -1;
          if (!isALiked && isBLiked) return 1;
          if (isAFollowed && !isBFollowed) return -1;
          if (!isAFollowed && isBFollowed) return 1;
          return new Date(b.ViewedAt) - new Date(a.ViewedAt);
        })
        .slice(0, 6)
        .map((v) => ({
          userId: v.User.UserID,
          username: v.User.Username,
          profileName: v.User.ProfileName,
          profilePicture: v.User.ProfilePicture,
          isFollowed: followingIds.includes(v.User.UserID),
          viewedAt: v.ViewedAt.toISOString(),
          isLiked: likedUserIds.has(v.User.UserID),
        }));
    };

    // Adjust counts for owner's stories
    const isMine = story.User.UserID === UserID;
    const isLiked = story.StoryLikes.length > 0;
    const totalViews = story._count.StoryViews;
    const totalLikes = story._count.StoryLikes;
    const adjustedViewCount = isMine && isViewed ? totalViews - 1 : totalViews;
    const adjustedLikeCount = isMine && isLiked ? totalLikes - 1 : totalLikes;

    // Build story response matching getStoryFeed
    const storyResponse = {
      storyId: story.StoryID,
      createdAt: story.CreatedAt,
      mediaUrl: story.MediaURL,
      expiresAt: story.ExpiresAt,
      isViewed,
      isLiked,
      isMine,
      likeCount: isMine ? adjustedLikeCount : undefined,
      viewCount: isMine ? adjustedViewCount : undefined,
      latestViewers: prioritizeViewers(
        story.StoryViews,
        followingIds,
        story.StoryID
      ),
    };

    res.json({ story: storyResponse });
  } catch (error) {
    console.error("Error in getStoryById:", error);
    handleServerError(res, error, "Failed to fetch story");
  }
};

/**
 * Records a view for a specific story
 * Only for non-owners, prevents duplicate views
 */
const recordStoryView = async (req, res) => {
  const { storyId } = req.params;
  const { UserID } = req.user;

  try {
    const story = await prisma.story.findUnique({
      where: { StoryID: parseInt(storyId) },
      select: {
        UserID: true,
        ExpiresAt: true,
        User: {
          select: {
            IsPrivate: true,
          },
        },
      },
    });

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    if (story.ExpiresAt < new Date()) {
      return res.status(400).json({ error: "Story has expired" });
    }

    if (story.User.IsPrivate) {
      const isFollowed = await prisma.follower.count({
        where: {
          UserID: story.UserID,
          FollowerUserID: UserID,
          Status: "ACCEPTED",
        },
      });

      if (!isFollowed) {
        return res.status(403).json({ error: "Private account" });
      }
    }

    const existingView = await prisma.storyView.findUnique({
      where: {
        StoryID_UserID: {
          StoryID: parseInt(storyId),
          UserID: UserID,
        },
      },
    });

    if (existingView) {
      return res
        .status(200)
        .json({ success: true, message: "Story already viewed" });
    }

    await prisma.storyView.create({
      data: {
        StoryID: parseInt(storyId),
        UserID: UserID,
        ViewedAt: new Date(),
      },
    });

    await del(`stories:feed:${UserID}`, UserID);

    res.status(200).json({ success: true, message: "Story view recorded" });
  } catch (error) {
    handleServerError(res, error, "Failed to record story view");
  }
};

/**
 * Creates notification for story like (using NotificationService - full real-time support)
 */
async function createStoryLikeNotification(storyId, likerId, likerUsername) {
  try {
    const story = await prisma.story.findUnique({
      where: { StoryID: parseInt(storyId) },
      select: { UserID: true },
    });

    if (!story || story.UserID === likerId) return;

    const recipient = await prisma.user.findUnique({
      where: { UserID: story.UserID },
      select: { NotificationPreferences: true },
    });

    const shouldNotify =
      !recipient?.NotificationPreferences?.NotificationTypes ||
      recipient.NotificationPreferences.NotificationTypes.includes(
        "STORY_LIKE"
      );

    if (!shouldNotify) return;

    await NotificationService.createNotification({
      userId: story.UserID,
      senderId: likerId,
      type: "STORY_LIKE",
      content: `${likerUsername} liked your story`,
      metadata: {
        storyId: parseInt(storyId),
        likerId,
        likerUsername,
      },
    });

    logger.info(
      `Story like notification sent to user ${story.UserID} from ${likerId}`
    );
  } catch (error) {
    logger.error(`Failed to send story like notification: ${error.message}`);
  }
}

/**
 * Toggles like status on a story
 * Creates notifications
 */
const toggleStoryLike = async (req, res) => {
  const { storyId } = req.params;
  const { UserID } = req.user;

  try {
    const story = await prisma.story.findUnique({
      where: { StoryID: parseInt(storyId) },
      select: { UserID: true, ExpiresAt: true },
    });

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    if (story.ExpiresAt < new Date()) {
      return res.status(400).json({ error: "Story has expired" });
    }

    if (story.UserID !== UserID) {
      const isFollowed = await prisma.follower.count({
        where: {
          UserID: story.UserID,
          FollowerUserID: UserID,
          Status: "ACCEPTED",
        },
      });
    }

    const existingLike = await prisma.storyLike.findUnique({
      where: {
        UserID_StoryID: {
          UserID,
          StoryID: parseInt(storyId),
        },
      },
    });

    let action;
    if (existingLike) {
      await prisma.storyLike.delete({
        where: {
          UserID_StoryID: {
            UserID,
            StoryID: parseInt(storyId),
          },
        },
      });
      action = "unliked";
    } else {
      await prisma.storyLike.create({
        data: {
          UserID,
          StoryID: parseInt(storyId),
        },
      });

      if (story.UserID !== UserID) {
        await createStoryLikeNotification(storyId, UserID, req.user.Username);
      }
      action = "liked";
    }

    await del(`stories:${story.UserID}`, story.UserID);
    await del(`stories:feed:${UserID}`, UserID);

    res.json({ success: true, action });
  } catch (error) {
    handleServerError(res, error, "Failed to toggle like");
  }
};

/**
 * Deletes a story and related data
 * Requires ownership
 */
const deleteStory = async (req, res) => {
  const { storyId } = req.params;
  const { UserID } = req.user;

  try {
    const story = await prisma.story.findFirst({
      where: {
        StoryID: parseInt(storyId),
        UserID,
      },
    });

    if (!story) {
      return res.status(404).json({
        error: "Story not found or you don't have permission to delete it",
      });
    }

    await prisma.storyHighlight.deleteMany({
      where: { StoryID: parseInt(storyId) },
    });

    await prisma.story.delete({
      where: { StoryID: parseInt(storyId) },
    });

    await del(`stories:${UserID}`, UserID);
    await del(`stories:feed:${UserID}`, UserID);

    res.json({ success: true, message: "Story deleted successfully" });
  } catch (error) {
    handleServerError(res, error, "Failed to delete story");
  }
};

/**
 * Fetches viewers of a specific story with their like status.
 * - Requires ownership (only story owner can fetch viewers)
 * - Excludes self from all viewer lists
 * - Excludes top 6 latest viewers already shown in getStoryFeed
 * - Prioritizes paginated results: likers first, then followed users, then others
 * - Each viewer includes: userId, username, profileName, profilePicture, isFollowed, viewedAt, isLiked
 * - Includes total count (excluding top 6 + self)
 * - Supports pagination with limit/offset
 * - Uses caching for performance optimization
 */
const getStoryViewersWithLikes = async (req, res) => {
  const { storyId } = req.params;
  const { UserID } = req.user;
  const { limit = 20, offset = 0 } = req.query;

  try {
    // --- Parse & validate inputs ---
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const parsedStoryId = parseInt(storyId, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: "Limit must be between 1 and 100" });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: "Offset must be non-negative" });
    }

    // --- Cache check ---
    const cacheKey = `story:${parsedStoryId}:viewers:${parsedOffset}:${parsedLimit}:v10`;
    const cachedData = await get(cacheKey);
    if (cachedData) {
      try {
        return res.json(
          typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData
        );
      } catch (err) {
        if (typeof logger !== "undefined") {
          logger.warn(`Cache parse error for ${cacheKey}: ${err.message}`);
        }
        if (typeof del === "function") await del(cacheKey);
      }
    }

    // --- Verify story ownership ---
    const story = await prisma.story.findUnique({
      where: { StoryID: parsedStoryId },
      select: { UserID: true },
    });
    if (!story) return res.status(404).json({ error: "Story not found" });
    if (story.UserID !== UserID) {
      return res.status(403).json({ error: "You don't own this story" });
    }

    // --- Get following IDs (excluding self) ---
    const followingRows = await prisma.follower.findMany({
      where: { FollowerUserID: UserID, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = followingRows.map((r) => r.UserID);
    const followingIdsNoSelf = followingIds.filter((id) => id !== UserID);

    // --- Get top 6 viewers already shown in getStoryFeed ---
    const topViewersRaw = await prisma.storyView.findMany({
      where: { StoryID: parsedStoryId, UserID: { not: UserID } },
      include: {
        User: { select: { UserID: true } },
      },
      orderBy: { ViewedAt: "desc" },
      take: 100, // fetch more to allow prioritization
    });

    // Get likes for this story (to prioritize likers)
    const storyLikes = await prisma.storyLike.findMany({
      where: { StoryID: parsedStoryId },
      select: { UserID: true },
    });
    const likedUserIds = new Set(storyLikes.map((l) => l.UserID));

    // Apply prioritization (same as getStoryFeed)
    const prioritizeViewers = (viewers) =>
      (viewers || [])
        .filter((v) => v.User && v.User.UserID !== UserID) // exclude self
        .sort((a, b) => {
          const aId = a.User.UserID;
          const bId = b.User.UserID;
          const isALiked = likedUserIds.has(aId);
          const isBLiked = likedUserIds.has(bId);
          const isAFollowed = followingIdsNoSelf.includes(aId);
          const isBFollowed = followingIdsNoSelf.includes(bId);

          // Priority 1: likers
          if (isALiked && !isBLiked) return -1;
          if (!isALiked && isBLiked) return 1;

          // Priority 2: followed
          if (isAFollowed && !isBFollowed) return -1;
          if (!isAFollowed && isBFollowed) return 1;

          // Priority 3: latest viewedAt
          return new Date(b.ViewedAt) - new Date(a.ViewedAt);
        });

    const prioritizedTopViewers = prioritizeViewers(topViewersRaw).slice(0, 6);
    const topViewerIds = prioritizedTopViewers.map((v) => v.User.UserID);

    // --- Total viewers (excluding top 6 + self) ---
    const totalViewers = await prisma.storyView.count({
      where: {
        StoryID: parsedStoryId,
        UserID: { not: UserID },
        ...(topViewerIds.length ? { UserID: { notIn: topViewerIds } } : {}),
      },
    });

    // --- Fetch paginated viewers (excluding top 6 + self) ---
    const viewersRaw = await prisma.storyView.findMany({
      where: {
        StoryID: parsedStoryId,
        UserID: { not: UserID },
        ...(topViewerIds.length ? { UserID: { notIn: topViewerIds } } : {}),
      },
      include: {
        User: {
          select: {
            UserID: true,
            Username: true,
            ProfileName: true,
            ProfilePicture: true,
          },
        },
      },
      orderBy: { ViewedAt: "desc" },
      skip: parsedOffset,
      take: parsedLimit,
    });

    // --- Apply prioritization (likers → followed → others → latest) ---
    const prioritizedViewers = prioritizeViewers(viewersRaw);

    // --- Format response (aligned with getStoryFeed user object) ---
    const formattedViewers = prioritizedViewers.map((v) => {
      const uid = v.User.UserID;
      return {
        userId: uid,
        username: v.User.Username,
        profileName: v.User.ProfileName,
        profilePicture: v.User.ProfilePicture,
        isFollowed: followingIdsNoSelf.includes(uid),
        viewedAt: v.ViewedAt.toISOString(),
        isLiked: likedUserIds.has(uid),
      };
    });

    const response = {
      totalViewers,
      viewers: formattedViewers,
      page: Math.floor(parsedOffset / parsedLimit) + 1,
      limit: parsedLimit,
    };

    // --- Cache result (5 minutes) ---
    await setWithTracking(cacheKey, response, 300, String(UserID));

    return res.json(response);
  } catch (error) {
    if (typeof logger !== "undefined") {
      logger.error(
        `getStoryViewersWithLikes error story=${req.params.storyId} user=${req.user?.UserID} msg=${error.message}`
      );
    }
    return handleServerError(res, error, "Failed to fetch story viewers");
  }
};

// Helper function to clear story-related caches
async function clearStoriesCache(userId, storyId) {
  try {
    await Promise.all([
      del(`stories:${userId}`, userId),
      del(`stories:feed:${userId}`, userId),
      del(`story:${storyId}:viewers:*`, userId),
    ]);
    logger.info(`Cleared story caches for user ${userId}, story ${storyId}`);
  } catch (error) {
    logger.error(`Failed to clear story caches: ${error.message}`);
  }
}

/**
 * Notifies all admins about a reported post or story
 * Uses NotificationService → full real-time, email, count update, preferences respect
 */
async function notifyAdminsAboutReport(
  itemId,
  reporterId,
  reason,
  reporterUsername,
  type = "POST" // "POST" or "STORY"
) {
  try {
    const itemType = type === "STORY" ? "story" : "post";
    const displayReason =
      reason.length > 50 ? reason.substring(0, 50) + "..." : reason;

    const admins = await prisma.user.findMany({
      where: { Role: "ADMIN" },
      select: { UserID: true },
    });

    if (admins.length === 0) {
      logger.warn("No admins found to notify about report");
      return;
    }

    const notificationPromises = admins.map((admin) =>
      NotificationService.createNotification({
        userId: admin.UserID,
        senderId: reporterId,
        type: "REPORT",
        content: `${reporterUsername} reported a ${itemType}: ${displayReason}`,
        metadata: {
          itemType,
          itemId: parseInt(itemId),
          reporterId,
          reason,
          reporterUsername,
          fullReason: reason,
        },
      })
    );

    await Promise.all(notificationPromises);

    logger.info(
      `Successfully notified ${admins.length} admin(s) about ${itemType} report (ID: ${itemId})`
    );
  } catch (error) {
    logger.error(
      `Failed to notify admins about ${type} report: ${error.message}`
    );
  }
}

/**
 * Reports a story to admins
 * - Validates story ID and access permissions
 * - Prevents duplicate reports
 * - Notifies admins upon successful report
 * - Clears relevant caches
 */
const reportStory = async (req, res) => {
  const { storyId } = req.params;
  const { reason } = req.body;
  const { UserID, Username } = req.user;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const parsedStoryId = parseInt(storyId, 10);
      if (isNaN(parsedStoryId)) throw new Error("Invalid story ID");
      if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
        throw new Error("Reason is required and must be a non-empty string");
      }

      const story = await tx.story.findUnique({
        where: { StoryID: parsedStoryId },
        select: {
          StoryID: true,
          UserID: true,
          ExpiresAt: true,
          User: { select: { IsPrivate: true, Username: true } },
        },
      });
      if (!story) throw new Error("Story not found");
      // if (story.ExpiresAt < new Date()) throw new Error("Story has expired");

      // Access check
      const isOwner = UserID === story.UserID;
      let hasAccess = !story.User.IsPrivate || isOwner;
      if (story.User.IsPrivate && !isOwner) {
        const followRelationship = await tx.follower.findFirst({
          where: {
            UserID: story.UserID,
            FollowerUserID: UserID,
            Status: "ACCEPTED",
          },
        });
        hasAccess = !!followRelationship;
      }
      if (!hasAccess)
        throw new Error(
          `You must follow @${story.User.Username} to report their stories`
        );

      // Check existing report
      let report = await tx.storyReport.findFirst({
        where: { StoryID: parsedStoryId, ReporterID: UserID },
      });

      if (!report) {
        // Create report only if not exists
        report = await tx.storyReport.create({
          data: {
            StoryID: parsedStoryId,
            ReporterID: UserID,
            Reason: reason.trim(),
            Status: "PENDING",
          },
          select: {
            ReportID: true,
            StoryID: true,
            ReporterID: true,
            Reason: true,
            Status: true,
            createdAt: true,
          },
        });

        // Notify admins only for first report
        await notifyAdminsAboutReport(
          parsedStoryId,
          UserID,
          reason.trim(),
          Username,
          "STORY"
        );
      }

      return report;
    });

    await clearStoriesCache(UserID, result.StoryID);

    res.status(201).json({
      message: "Story reported successfully",
      reportId: result.ReportID,
    });
  } catch (error) {
    logger.error(
      `Error reporting story ${storyId} by user ${UserID}: ${error.message}`
    );
    handleServerError(res, error, "Failed to report story");
  }
};

module.exports = {
  createStory,
  getStoryViews,
  getUserStories,
  getStoryFeed,
  getStoryById,
  recordStoryView,
  toggleStoryLike,
  reportStory,
  deleteStory,
  getStoryViewersWithLikes,
};
