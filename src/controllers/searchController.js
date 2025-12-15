const { validationResult } = require("express-validator");
const redis = require("../utils/redis");
const prisma = require("../utils/prisma");
const {
  handleValidationError,
  handleServerError,
} = require("../utils/errorHandler");
const logger = require("../utils/logger");

// Constant for configuration
const POST_CACHE_TTL = 3600; // 1 hour cache duration for debugging

/**
 * Clears cache for a specific post and all posts for a user
 * Uses a Redis set to track cache keys
 */
async function clearPostsCache(userId, postId) {
  try {
    // Clear specific post cache
    await redis.del(`post:${postId}`);
    logger.info(`Successfully deleted cache for key: post:${postId}`);

    // Clear all posts cache for the user using a set
    const cacheSetKey = `user:posts:keys:${userId}`;
    let cacheKeys = [];
    try {
      cacheKeys = await redis.smembers(cacheSetKey);
    } catch (smembersError) {
      logger.error(
        `Redis smembers error for ${cacheSetKey}: ${smembersError.message}`
      );
      // Continue without cache keys if smembers fails
    }
    if (cacheKeys.length > 0) {
      await redis.del(cacheKeys);
      await redis.del(cacheSetKey); // Clear the set itself
      logger.info(
        `Successfully deleted ${cacheKeys.length} cache keys for user ${userId}`
      );
    } else {
      logger.info(`No cache keys found for user ${userId}`);
    }
  } catch (cacheError) {
    logger.error(
      `Failed to clear cache for post ${postId}: ${cacheError.message}`
    );
  }
}

/**
 * Adds a cache key to the user's set of post cache keys
 */
async function addToPostsCacheSet(userId, cacheKey) {
  try {
    const cacheSetKey = `user:posts:keys:${userId}`;
    await redis.sadd(cacheSetKey, cacheKey);
    logger.info(`Added cache key ${cacheKey} to set ${cacheSetKey}`);
  } catch (cacheError) {
    logger.error(
      `Failed to add cache key ${cacheKey} to set: ${cacheError.message}`
    );
  }
}

// === Helper: Cache Result ===
async function cacheResult(cacheKey, userId, data) {
  try {
    await redis.set(cacheKey, JSON.stringify(data), "EX", POST_CACHE_TTL);
    await addToPostsCacheSet(userId, cacheKey);
  } catch (err) {
    logger.warn(`Failed to cache search result: ${err.message}`);
  }
}

// Simple groupBy helper
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

/**
 * Global Search – Users + Posts
 * -------------------------------------------------
 * • Supports type = ALL | USERS | POSTS
 * • Calculates isFollowed: true | false | "pending"
 * • Uses Set for O(1) lookup (no map needed)
 * • Batch queries + Map to avoid N+1
 * • Caches result in Redis (TTL 5 minutes)
 * • Secure pagination limits
 */
const search = async (req, res) => {
  // ---------- 1. Validation ----------
  const errors = validationResult(req);
  if (!errors.isEmpty()) return handleValidationError(res, errors);

  const { query = '', type = 'ALL' } = req.query;
  let page = Math.max(1, Number(req.query.page) || 1);
  let limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const userId = req.user.UserID;
  const skip = (page - 1) * limit;

  try {
    // ---------- 2. Cache Check ----------
    const lastView = await prisma.postView.findFirst({
      where: { UserID: userId },
      orderBy: { ViewedAt: 'desc' },
      select: { ViewedAt: true },
    });
    const viewTs = lastView?.ViewedAt?.getTime() ?? 0;
    const cacheKey = `search:${userId}:${query}:${type}:${page}:${limit}:${viewTs}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        return res.json({ users: data.users ?? [], posts: data.posts ?? [] });
      } catch (_) {
        logger.warn('Search cache parse error');
      }
    }

    // ---------- 3. Parallel: Following (ACCEPTED + PENDING) + Viewed ----------
    const [followingRes, pendingRes, viewedRes] = await Promise.all([
      prisma.follower.findMany({
        where: { FollowerUserID: userId, Status: 'ACCEPTED' },
        select: { UserID: true },
      }),
      prisma.follower.findMany({
        where: { FollowerUserID: userId, Status: 'PENDING' },
        select: { UserID: true },
      }),
      prisma.postView.findMany({
        where: { UserID: userId },
        select: { PostID: true },
      }),
    ]);

    // Sets for fast lookup
    const acceptedIds = new Set(followingRes.map(f => f.UserID));
    const pendingIds = new Set(pendingRes.map(f => f.UserID));
    const viewedPostIds = new Set(viewedRes.map(v => v.PostID));

    let users = [];
    let posts = [];

    // ---------- 4. SEARCH USERS ----------
    if (['USERS', 'ALL'].includes(type)) {
      const found = await prisma.user.findMany({
        where: {
          OR: [
            { Username: { contains: query, mode: "insensitive" } },
            { ProfileName: { contains: query, mode: "insensitive" } },
            { Email: { contains: query, mode: "insensitive" } },
          ],
          NOT: { UserID: userId },
        },
        select: {
          UserID: true,
          Username: true,
          ProfilePicture: true,
          Bio: true,
          IsPrivate: true,
        },
        orderBy: { Username: "asc" },
        skip,
        take: limit,
      });

      users = found.map(u => {
        const uid = u.UserID;
        let isFollowed = false;
        if (acceptedIds.has(uid)) isFollowed = true;
        else if (pendingIds.has(uid)) isFollowed = 'pending';

        return {
          userId: uid,
          username: u.Username,
          profilePicture: u.ProfilePicture,
          bio: u.Bio,
          isPrivate: u.IsPrivate,
          isFollowed,
        };
      });
    }

    // ---------- 5. SEARCH POSTS ----------
    if (['POSTS', 'ALL'].includes(type)) {
      const rawPosts = await prisma.post.findMany({
        where: {
          Content: { contains: query, mode: 'insensitive' },
          OR: [
            { privacy: 'PUBLIC' },
            { privacy: 'FOLLOWERS_ONLY' },
            { UserID: userId },
          ],
        },
        include: {
          User: {
            select: {
              UserID: true,
              Username: true,
              ProfilePicture: true,
              IsPrivate: true,
            },
          },
          SharedPost: {
            include: {
              User: { select: { UserID: true, Username: true, ProfilePicture: true } },
              _count: { select: { Likes: true, Comments: true, Shares: true } },
            },
          },
          _count: { select: { Likes: true, Comments: true, Shares: true } },
        },
        orderBy: { CreatedAt: 'desc' },
        skip,
        take: limit * 2,
      });

      // Privacy filter
      const filteredPosts = rawPosts.filter(p => {
        if (p.UserID === userId) return true;
        if (p.privacy === 'PUBLIC') return true;
        if (p.privacy === 'FOLLOWERS_ONLY' && !p.User.IsPrivate) return true;
        return acceptedIds.has(p.UserID); // Only accepted followers
      });

      if (!filteredPosts.length) {
        await cacheResult(cacheKey, { users, posts: [] });
        return res.json({ users, posts: [] });
      }

      const postIds = filteredPosts.map(p => p.PostID);

      // Batch interactions
      const [
        userLikes,
        userSaves,
        allLikes,
        rootComments,
      ] = await Promise.all([
        prisma.like.findMany({ where: { PostID: { in: postIds }, UserID: userId }, select: { PostID: true } }),
        prisma.savedPost.findMany({ where: { PostID: { in: postIds }, UserID: userId }, select: { PostID: true } }),
        prisma.like.findMany({
          where: { PostID: { in: postIds } },
          orderBy: { CreatedAt: 'desc' },
          include: { User: { select: { UserID: true, Username: true, ProfileName: true, ProfilePicture: true } } },
        }),
        prisma.comment.findMany({
          where: { PostID: { in: postIds }, ParentCommentID: null },
          orderBy: { CreatedAt: 'desc' },
          include: {
            User: { select: { UserID: true, Username: true, ProfilePicture: true } },
            CommentLikes: {
              orderBy: { CreatedAt: 'desc' },
              take: 3,
              include: { User: { select: { Username: true, ProfilePicture: true } } },
            },
            Replies: {
              orderBy: { CreatedAt: 'asc' },
              take: 3,
              include: {
                User: { select: { UserID: true, Username: true, ProfilePicture: true } },
                CommentLikes: {
                  orderBy: { CreatedAt: 'asc' },
                  take: 3,
                  include: { User: { select: { Username: true, ProfilePicture: true } } },
                },
                _count: { select: { CommentLikes: true } },
              },
            },
            _count: { select: { CommentLikes: true, Replies: true } },
          },
        }),
      ]);

      // Group data
      const likesMap = new Map();
      const commentsMap = new Map();

      allLikes.forEach(l => {
        if (!likesMap.has(l.PostID)) likesMap.set(l.PostID, []);
        likesMap.get(l.PostID).push(l);
      });

      rootComments.forEach(c => {
        if (!commentsMap.has(c.PostID)) commentsMap.set(c.PostID, []);
        commentsMap.get(c.PostID).push(c);
      });

      const likedSet = new Set(userLikes.map(l => l.PostID));
      const savedSet = new Set(userSaves.map(s => s.PostID));

      // Format posts
      const formatted = filteredPosts.map(p => {
        const pid = p.PostID;
        const isLiked = likedSet.has(pid);
        const isSaved = savedSet.has(pid);
        const isUnseen = !viewedPostIds.has(pid);

        // Determine follow status for post owner
        const ownerId = p.User.UserID;
        let isFollowed = false;
        if (acceptedIds.has(ownerId)) isFollowed = true;
        else if (pendingIds.has(ownerId)) isFollowed = 'pending';

        // Likes priority
        const likes = likesMap.get(pid) ?? [];
        const myLike = likes.find(l => l.User.UserID === userId);
        const followingLikes = likes.filter(l => acceptedIds.has(l.User.UserID) && l.User.UserID !== userId);
        const otherLikes = likes.filter(l => l.User.UserID !== userId && !acceptedIds.has(l.User.UserID));

        const topLikes = [
          ...(myLike ? [myLike] : []),
          ...followingLikes.slice(0, myLike ? 9 : 10),
          ...otherLikes.slice(0, Math.max(0, 10 - (myLike ? 1 : 0) - followingLikes.length)),
        ].map(l => {
          const uid = l.User.UserID;
          let followed = false;
          if (acceptedIds.has(uid)) followed = true;
          else if (pendingIds.has(uid)) followed = 'pending';

          return {
            userId: uid,
            username: l.User.Username,
            profileName: l.User.ProfileName,
            profilePicture: l.User.ProfilePicture,
            isFollowed: followed,
            likedAt: l.CreatedAt.toISOString(),
          };
        });

        // Comments priority
        const comments = (commentsMap.get(pid) ?? []).map(c => ({
          ...c,
          priority: c.UserID === userId ? 0 : acceptedIds.has(c.UserID) ? 1 : 2,
        }));

        const sorted = comments
          .sort((a, b) => a.priority - b.priority || b.CreatedAt - a.CreatedAt)
          .slice(0, 3);

        const Comments = sorted.map(c => ({
          CommentID: c.CommentID,
          Content: c.Content,
          CreatedAt: c.CreatedAt,
          User: c.User,
          isMine: c.UserID === userId,
          isLiked: c.CommentLikes.some(l => l.UserID === userId),
          likeCount: c._count.CommentLikes,
          replyCount: c._count.Replies,
          likedBy: c.CommentLikes.map(l => ({
            username: l.User.Username,
            profilePicture: l.User.ProfilePicture,
          })),
          Replies: c.Replies.map(r => ({
            CommentID: r.CommentID,
            Content: r.Content,
            CreatedAt: r.CreatedAt,
            User: r.User,
            isMine: r.UserID === userId,
            isLiked: r.CommentLikes.some(l => l.UserID === userId),
            likeCount: r._count.CommentLikes,
            likedBy: r.CommentLikes.map(l => ({
              username: l.User.Username,
              profilePicture: l.User.ProfilePicture,
            })),
          })),
        }));

        return {
          PostID: p.PostID,
          Content: p.Content,
          ImageURL: p.ImageURL,
          VideoURL: p.VideoURL,
          CreatedAt: p.CreatedAt,
          UpdatedAt: p.UpdatedAt,
          privacy: p.privacy,
          User: {
            UserID: p.User.UserID,
            Username: p.User.Username,
            ProfilePicture: p.User.ProfilePicture,
            IsPrivate: p.User.IsPrivate,
            isFollowed,
          },
          isMine: p.UserID === userId,
          isLiked,
          isSaved,
          isUnseen,
          likeCount: p._count.Likes,
          commentCount: p._count.Comments,
          shareCount: p._count.Shares,
          Likes: topLikes,
          Comments,
          SharedPost: p.SharedPost
            ? {
                PostID: p.SharedPost.PostID,
                Content: p.SharedPost.Content,
                ImageURL: p.SharedPost.ImageURL,
                VideoURL: p.SharedPost.VideoURL,
                CreatedAt: p.SharedPost.CreatedAt,
                User: p.SharedPost.User,
                likeCount: p.SharedPost._count.Likes,
                commentCount: p.SharedPost._count.Comments,
                shareCount: p.SharedPost._count.Shares,
              }
            : null,
        };
      });

      posts = formatted.slice(0, limit);
    }

    // ---------- 6. Cache & Respond ----------
    await cacheResult(cacheKey, { users, posts });
    return res.json({ users, posts });

  } catch (err) {
    logger.error(`Search error: ${err.message}`, { stack: err.stack });
    return handleServerError(res, err, 'Search operation failed');
  }
};


/**
 * Handles search for users or messages in the messenger
 * Searches both if type is not specified, otherwise searches based on type (USER, MESSAGE)
 * Returns search results with optional message if no results found
 */
const messangerSearch = async (req, res) => {
  // Check for validation errors in the request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return handleValidationError(res, errors);
  }

  // Extract query parameters (search term, type)
  const { query, type } = req.query;
  const userId = req.user.UserID;

  try {
    let users = []; // Store user search results
    let messages = []; // Store message search results

    // Determine what to search based on type
    const shouldSearchUsers = !type || type === "USER"; // Search users if type is not specified or USER
    const shouldSearchMessages = !type || type === "MESSAGE"; // Search messages if type is not specified or MESSAGE

    // Search for users in conversations
    if (shouldSearchUsers) {
      // Find conversations involving the current user
      const conversations = await prisma.conversation.findMany({
        where: {
          participants: { some: { UserID: userId } },
        },
        select: {
          participants: {
            where: {
              UserID: { not: userId },
            },
            select: {
              UserID: true,
              Username: true,
              ProfilePicture: true,
            },
          },
        },
      });

      // Filter users by username matching the query
      const otherUsers = conversations
        .flatMap((conv) => conv.participants)
        .filter((user) =>
          user.Username.toLowerCase().includes(query.toLowerCase())
        );

      // Remove duplicate users
      users = Array.from(
        new Map(otherUsers.map((user) => [user.UserID, user])).values()
      );
    }

    // Search for messages in conversations
    if (shouldSearchMessages) {
      // Find messages matching the query in conversations involving the user
      const foundMessages = await prisma.message.findMany({
        where: {
          conversation: {
            participants: { some: { UserID: userId } },
          },
          content: { contains: query, mode: "insensitive" },
        },
        select: {
          content: true,
          createdAt: true,
          readAt: true,
          senderId: true,
          conversation: {
            select: {
              id: true,
              participants: {
                where: { UserID: { not: userId } },
                select: {
                  UserID: true,
                  Username: true,
                  ProfilePicture: true,
                },
              },
            },
          },
        },
      });

      // Format messages with other user's info
      messages = foundMessages
        .map((message) => {
          const otherUser = message.conversation.participants[0];
          if (!otherUser) {
            return null; // Skip if no other user found
          }

          return {
            content: message.content,
            createdAt: message.createdAt,
            isReaded: !!message.readAt,
            conversationId: message.conversation.id,
            otherUser: {
              UserID: otherUser.UserID,
              Username: otherUser.Username,
              ProfilePicture: otherUser.ProfilePicture,
            },
          };
        })
        .filter((message) => message !== null); // Remove invalid messages
    }

    // Send the search results with a message if no results found
    res.status(200).json({
      users,
      messages,
      message:
        users.length === 0 && messages.length === 0
          ? "No results found for your search."
          : undefined,
    });
  } catch (error) {
    // Handle server errors
    handleServerError(res, error, "Error while searching in messenger");
  }
};

module.exports = { search, messangerSearch };
