const logger = require("../utils/logger");
const prisma = require("../utils/prisma");
const redis = require("../utils/redis");
const { v4: uuidv4 } = require("uuid");
const { uploadToCloud } = require("../services/cloudService");
const {
  handleServerError,
  handleNotFoundError,
  handleForbiddenError,
} = require("../utils/errorHandler");

// Constants for configuration
const POST_CACHE_TTL = 3600; // 1 hour cache duration for debugging
const ALLOWED_IMAGE_TYPES = ["jpg", "jpeg", "png", "gif", "webp"];
const ALLOWED_VIDEO_TYPES = ["mp4", "mov", "avi", "mkv", "webm"];

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
 * Creates notification for post like
 */
async function createLikeNotification(postId, likerId, likerUsername) {
  const post = await prisma.post.findUnique({
    where: { PostID: parseInt(postId) },
    select: { UserID: true },
  });

  if (!post || post.UserID === likerId) return;

  const recipient = await prisma.user.findUnique({
    where: { UserID: post.UserID },
    select: { NotificationPreferences: true },
  });

  const shouldNotify =
    !recipient.NotificationPreferences ||
    !recipient.NotificationPreferences.NotificationTypes ||
    recipient.NotificationPreferences.NotificationTypes.includes("LIKE");

  if (shouldNotify) {
    await prisma.notification.create({
      data: {
        UserID: post.UserID,
        SenderID: likerId,
        Type: "LIKE",
        Content: `${likerUsername} liked your post`,
        Metadata: {
          postId: parseInt(postId),
          likerId,
          likerUsername,
        },
      },
    });
    logger.info(
      `Like notification created for post ${postId} by user ${likerId}`
    );
  }
}

/**
 * Creates notification for post comment
 */
async function createCommentNotification(
  postId,
  commenterId,
  postOwnerId,
  commenterUsername
) {
  const recipient = await prisma.user.findUnique({
    where: { UserID: postOwnerId },
    select: { NotificationPreferences: true },
  });

  const shouldNotify =
    !recipient.NotificationPreferences ||
    !recipient.NotificationPreferences.NotificationTypes ||
    recipient.NotificationPreferences.NotificationTypes.includes("COMMENT");

  if (shouldNotify) {
    await prisma.notification.create({
      data: {
        UserID: postOwnerId,
        SenderID: commenterId,
        Type: "COMMENT",
        Content: `${commenterUsername} commented on your post`,
        Metadata: {
          postId: parseInt(postId),
          commenterId,
          commenterUsername,
        },
      },
    });
    logger.info(
      `Comment notification created for post ${postId} by user ${commenterId}`
    );
  }
}

/**
 * Creates notification for comment like
 */
async function createCommentLikeNotification(
  commentId,
  likerId,
  likerUsername
) {
  const comment = await prisma.comment.findUnique({
    where: { CommentID: parseInt(commentId) },
    select: { UserID: true, PostID: true },
  });

  if (!comment || comment.UserID === likerId) return;

  const recipient = await prisma.user.findUnique({
    where: { UserID: comment.UserID },
    select: { NotificationPreferences: true },
  });

  const shouldNotify =
    !recipient.NotificationPreferences ||
    !recipient.NotificationPreferences.NotificationTypes ||
    recipient.NotificationPreferences.NotificationTypes.includes(
      "COMMENT_LIKE"
    );

  if (shouldNotify) {
    await prisma.notification.create({
      data: {
        UserID: comment.UserID,
        SenderID: likerId,
        Type: "COMMENT_LIKE",
        Content: `${likerUsername} liked your comment`,
        Metadata: {
          commentId: parseInt(commentId),
          postId: comment.PostID,
          likerId,
          likerUsername,
        },
      },
    });
    logger.info(
      `Comment like notification created for comment ${commentId} by user ${likerId}`
    );
  }
}

/**
 * Creates notification for comment reply
 */
async function createCommentReplyNotification(
  commentId,
  replierId,
  commentOwnerId,
  replierUsername
) {
  const comment = await prisma.comment.findUnique({
    where: { CommentID: parseInt(commentId) },
    select: { PostID: true },
  });

  if (!comment || commentOwnerId === replierId) return;

  const recipient = await prisma.user.findUnique({
    where: { UserID: commentOwnerId },
    select: { NotificationPreferences: true },
  });

  const shouldNotify =
    !recipient.NotificationPreferences ||
    !recipient.NotificationPreferences.NotificationTypes ||
    recipient.NotificationPreferences.NotificationTypes.includes(
      "COMMENT_REPLY"
    );

  if (shouldNotify) {
    await prisma.notification.create({
      data: {
        UserID: commentOwnerId,
        SenderID: replierId,
        Type: "COMMENT_REPLY",
        Content: `${replierUsername} replied to your comment`,
        Metadata: {
          commentId: parseInt(commentId),
          postId: comment.PostID,
          replierId,
          replierUsername,
        },
      },
    });
    logger.info(
      `Comment reply notification created for comment ${commentId} by user ${replierId}`
    );
  }
}

/**
 * Creates notification for post share
 */
async function createShareNotification(
  originalPostId,
  sharerId,
  originalOwnerId,
  sharerUsername
) {
  const recipient = await prisma.user.findUnique({
    where: { UserID: originalOwnerId },
    select: { NotificationPreferences: true },
  });

  const shouldNotify =
    !recipient.NotificationPreferences ||
    !recipient.NotificationPreferences.NotificationTypes ||
    recipient.NotificationPreferences.NotificationTypes.includes("SHARE");

  if (shouldNotify) {
    await prisma.notification.create({
      data: {
        UserID: originalOwnerId,
        SenderID: sharerId,
        Type: "SHARE",
        Content: `${sharerUsername} shared your post`,
        Metadata: {
          originalPostId: parseInt(originalPostId),
          sharerId,
          sharerUsername,
        },
      },
    });
    logger.info(
      `Share notification created for post ${originalPostId} by user ${sharerId}`
    );
  }
}

/**
 * Notifies admins about reported post
 */
async function notifyAdminsAboutReport(
  postId,
  reporterId,
  reason,
  reporterUsername
) {
  const admins = await prisma.user.findMany({
    where: { Role: "ADMIN" },
    select: { UserID: true, NotificationPreferences: true },
  });

  await Promise.all(
    admins.map((admin) => {
      const shouldNotify =
        !admin.NotificationPreferences ||
        !admin.NotificationPreferences.NotificationTypes ||
        admin.NotificationPreferences.NotificationTypes.includes("REPORT");

      if (shouldNotify) {
        return prisma.notification.create({
          data: {
            UserID: admin.UserID,
            SenderID: reporterId,
            Type: "REPORT",
            Content: `${reporterUsername} reported a post: ${reason}`,
            Metadata: {
              postId,
              reporterId,
              reason,
              reporterUsername,
            },
          },
        });
      }
    })
  );
  logger.info(
    `Admins notified about report on post ${postId} by user ${reporterId}`
  );
}

/**
 * Creates a new post with moderation
 * Supports text, image, video, or any combination
 */
const createPost = async (req, res) => {
  const { content } = req.body;
  const userId = req.user.UserID;
  const imageFile = req.file; // Assuming multer is used for file uploads

  try {
    // Validate that at least one of content, image, or video is provided
    if (!content && !imageFile) {
      logger.info(
        `No content or media provided for post creation by user ${userId}`
      );
      return res.status(400).json({
        message: "At least one of content, image, or video is required",
      });
    }

    // Upload image or video to Cloudinary (outside transaction)
    let imageUrl = null;
    let videoUrl = null;
    if (imageFile) {
      const ALLOWED_MEDIA_TYPES = [
        ...ALLOWED_IMAGE_TYPES,
        ...ALLOWED_VIDEO_TYPES,
      ];
      logger.info(
        `Uploading media: ${imageFile.mimetype}, size: ${
          imageFile.size
        }, allowed formats: ${ALLOWED_MEDIA_TYPES.join(", ")}`
      );
      const uploadResult = await uploadToCloud(imageFile.buffer, {
        folder: "posts",
        resource_type: "auto",
        allowed_formats: ALLOWED_MEDIA_TYPES,
      });

      if (uploadResult.resource_type === "video") {
        videoUrl = uploadResult.secure_url;
        logger.info(`Video uploaded successfully: ${videoUrl}`);
      } else {
        imageUrl = uploadResult.secure_url;
        logger.info(`Image uploaded successfully: ${imageUrl}`);
      }
    }

    // Perform database operations in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Fetch user's IsPrivate status
      const user = await tx.user.findUnique({
        where: { UserID: userId },
        select: { IsPrivate: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Create post with privacy based on user's IsPrivate status
      const post = await tx.post.create({
        data: {
          UserID: userId,
          Content: content ? content.trim() : null, // Allow null if no content
          ImageURL: imageUrl,
          VideoURL: videoUrl,
          privacy: user.IsPrivate ? "FOLLOWERS_ONLY" : "PUBLIC",
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
        },
      });

      return post;
    });

    // Clear cache after transaction
    await clearPostsCache(userId, result.PostID);

    logger.info(
      `Post created successfully: PostID ${result.PostID} by UserID ${userId}`
    );
    res.status(201).json({
      message: "Post created successfully",
      post: {
        ...result,
        isMine: result.User.UserID === userId,
      },
    });
  } catch (error) {
    logger.error(`Error creating post: ${error.message}`);
    res.status(500).json({
      message: "Error creating post",
      error: error.message,
    });
  }
};


/**
 * Optimized getPosts function
 * - Batch queries instead of N+1
 * - Parallel execution with Promise.all
 * - In-memory grouping for likes & comments
 * - Cache maintained
 * - Replies are oldest first, no user priority
 * - Added prioritization for unseen posts: unseen posts appear first, sorted by creation date, then randomized within groups
 * - Added PostView query to track viewed posts for the current user
 * - Updated cache key to include last view timestamp for accuracy
 * - Added limited random suggested posts from non-followed users (public posts only)
 * - If no followed users or no posts from them, return suggested posts
 * - Added isSuggested flag for suggested posts
 * - Added isFollowed inside post.User object
 * - Likes: Only include current user and followed users (up to 10 total)
 * - Comments likedBy: Only include current user and followed users
 * - Optimized queries with selective includes and minimal data fetching
 */
const getPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.UserID;

    // Define constants for suggested posts (optimized limits)
    const SUGGESTED_LIMIT = Math.min(3, Math.floor(limit / 4) || 1); // Limited number, e.g., 3 or 25% of limit
    const SUGGESTED_FETCH_EXTRA = Math.min(20, limit * 2); // Fetch more to shuffle, but cap for performance

    // Fetch the last view timestamp to make cache key unique based on view history
    const lastView = await prisma.postView.findFirst({
      where: { UserID: userId },
      orderBy: { ViewedAt: "desc" },
      select: { ViewedAt: true },
    });
    const viewTimestamp = lastView?.ViewedAt?.getTime() || "0";

    const cacheKey = `posts:${userId}:${page}:${limit}:${viewTimestamp}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return res.json(JSON.parse(cached));
      } catch (err) {
        logger.error(`Cache parse error: ${err.message}`);
      }
    }

    // === Followings (optimized select) ===
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    let posts = [];
    let filteredPosts = [];
    let postIds = [];

    if (followingIds.length > 0) {
      // === Posts from followed users (limited time range for performance) ===
      posts = await prisma.post.findMany({
        skip: offset,
        take: parseInt(limit) * 2,
        where: {
          UserID: { in: followingIds },
          CreatedAt: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) }, // Last 120 days
        },
        orderBy: { CreatedAt: "desc" },
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
              User: {
                select: { UserID: true, Username: true, ProfilePicture: true },
              },
            },
          },
          _count: { select: { Likes: true, Comments: true, Shares: true } },
        },
      });

      filteredPosts = posts.filter(
        (p) => !p.User.IsPrivate || followingIds.includes(p.User.UserID)
      );
      postIds = filteredPosts.map((p) => p.PostID);
    }

    // === Suggested Posts (from non-followed users, public only) ===
    // Always fetch a limited number, but if no main posts, fetch up to limit
    const suggestedFetchLimit =
      postIds.length === 0 ? parseInt(limit) * 2 : SUGGESTED_FETCH_EXTRA;
    const suggestedWhere = {
      privacy: "PUBLIC",
      User: { IsPrivate: false, IsBanned: false, Role: { not: "BANNED" } },
      UserID: { notIn: [userId, ...followingIds] },
      CreatedAt: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) }, // Last 120 days
    };

    let suggestedPosts = await prisma.post.findMany({
      take: suggestedFetchLimit,
      where: suggestedWhere,
      orderBy: { CreatedAt: "desc" },
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
            User: {
              select: { UserID: true, Username: true, ProfilePicture: true },
            },
          },
        },
        _count: { select: { Likes: true, Comments: true, Shares: true } },
      },
    });

    // Shuffle and select limited random suggested posts
    suggestedPosts = suggestedPosts
      .sort(() => 0.5 - Math.random())
      .slice(0, postIds.length === 0 ? parseInt(limit) : SUGGESTED_LIMIT);

    const suggestedPostIds = suggestedPosts.map((p) => p.PostID);

    // Combine postIds and filteredPosts if there are suggested
    const allPostIds = [...postIds, ...suggestedPostIds];
    const allPosts = [...filteredPosts, ...suggestedPosts];

    if (!allPostIds.length) {
      await redis.set(cacheKey, JSON.stringify([]), "EX", POST_CACHE_TTL);
      await addToPostsCacheSet(userId, cacheKey);
      return res.json([]);
    }

    // === Batch Queries (optimized with minimal selects) ===
    const [userLikes, userSaves, allLikes, allComments, userViews] =
      await Promise.all([
        prisma.like.findMany({
          where: { PostID: { in: allPostIds }, UserID: userId },
          select: { PostID: true },
        }),
        prisma.savedPost.findMany({
          where: { PostID: { in: allPostIds }, UserID: userId },
          select: { PostID: true },
        }),
        prisma.like.findMany({
          where: { PostID: { in: allPostIds } },
          orderBy: { CreatedAt: "desc" },
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
        }),
        prisma.comment.findMany({
          where: { PostID: { in: allPostIds }, ParentCommentID: null },
          orderBy: { CreatedAt: "desc" },
          include: {
            User: {
              select: { UserID: true, Username: true, ProfilePicture: true },
            },
            CommentLikes: {
              orderBy: { CreatedAt: "desc" },
              take: 3,
              include: {
                User: { select: { Username: true, ProfilePicture: true, UserID: true } }, // Added UserID for filtering
              },
            },
            Replies: {
              orderBy: { CreatedAt: "asc" },
              take: 3,
              include: {
                User: {
                  select: {
                    UserID: true,
                    Username: true,
                    ProfilePicture: true,
                  },
                },
                CommentLikes: {
                  orderBy: { CreatedAt: "asc" },
                  take: 3,
                  include: {
                    User: { select: { Username: true, ProfilePicture: true, UserID: true } }, // Added UserID for filtering
                  },
                },
                _count: { select: { CommentLikes: true } },
              },
            },
            _count: { select: { CommentLikes: true, Replies: true } },
          },
        }),
        prisma.postView.findMany({
          where: { PostID: { in: allPostIds }, UserID: userId },
          select: { PostID: true },
        }),
      ]);

    // === Group Data In Memory ===
    const likesByPost = groupBy(allLikes, (l) => l.PostID);
    const commentsByPost = groupBy(allComments, (c) => c.PostID);

    const formatted = allPosts.map((post) => {
      const isLiked = userLikes.some((l) => l.PostID === post.PostID);
      const isSaved = userSaves.some((s) => s.PostID === post.PostID);
      const isUnseen = !userViews.some((v) => v.PostID === post.PostID);
      const isFollowed = followingIds.includes(post.User.UserID);
      const isSuggested = !isFollowed; // Suggested if not from followed users

      // === Likes: Only me + followed users (up to 10) ===
      const likes = likesByPost[post.PostID] || [];
      const myLike = likes.find((l) => l.User.UserID === userId);
      const followingLikes = likes.filter(
        (l) => followingIds.includes(l.User.UserID) && l.User.UserID !== userId
      );

      const Likes = [
        ...(myLike ? [myLike] : []),
        ...followingLikes.slice(0, myLike ? 9 : 10),
      ].map((like) => ({
        userId: like.User.UserID,
        username: like.User.Username,
        profileName: like.User.ProfileName,
        profilePicture: like.User.ProfilePicture,
        isFollowed: followingIds.includes(like.User.UserID),
        likedAt: like.CreatedAt.toISOString(),
      }));

      // === Comments ===
      const comments = (commentsByPost[post.PostID] || []).map((c) => ({
        ...c,
        priority:
          c.UserID === userId ? 0 : followingIds.includes(c.UserID) ? 1 : 2,
      }));

      const sortedComments = comments
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.CreatedAt - a.CreatedAt;
        })
        .slice(0, 3);

      const Comments = sortedComments.map((comment) => ({
        CommentID: comment.CommentID,
        Content: comment.Content,
        CreatedAt: comment.CreatedAt,
        User: comment.User,
        isMine: comment.UserID === userId,
        isLiked: comment.CommentLikes.some((l) => l.UserID === userId),
        likeCount: comment._count.CommentLikes,
        replyCount: comment._count.Replies,
        likedBy: comment.CommentLikes
          .filter((l) => l.UserID === userId || followingIds.includes(l.UserID))
          .map((l) => ({
            username: l.User.Username,
            profilePicture: l.User.ProfilePicture,
          })),
        Replies: comment.Replies.map((reply) => ({
          CommentID: reply.CommentID,
          Content: reply.Content,
          CreatedAt: reply.CreatedAt,
          User: reply.User,
          isMine: reply.UserID === userId,
          isLiked: reply.CommentLikes.some((l) => l.UserID === userId),
          likeCount: reply._count.CommentLikes,
          likedBy: reply.CommentLikes
            .filter((l) => l.UserID === userId || followingIds.includes(l.UserID))
            .map((l) => ({
              username: l.User.Username,
              profilePicture: l.User.ProfilePicture,
            })),
        })),
      }));

      return {
        ...post,
        User: {
          ...post.User,
          isFollowed,
        },
        isMine: post.User.UserID === userId,
        isLiked,
        isSaved,
        isUnseen,
        isSuggested,
        shareCount: post._count.Shares,
        likeCount: post._count.Likes,
        commentCount: post._count.Comments,
        Likes,
        Comments,
        SharedPost: post.SharedPost
          ? {
              ...post.SharedPost,
              User: post.SharedPost.User,
            }
          : null,
      };
    });

    // Added: Sort to prioritize unseen posts first (descending isUnseen), then by creation date (newest first)
    // Then, apply randomization only within the same isUnseen group
    const sorted = formatted.sort((a, b) => {
      if (a.isUnseen !== b.isUnseen) return b.isUnseen - a.isUnseen; // Unseen (true) first
      return b.CreatedAt.getTime() - a.CreatedAt.getTime(); // Newer posts first within group
    });

    const shuffled = sorted
      .map((post, index, array) => {
        // Group randomization: randomize only within consecutive posts with same isUnseen
        const groupStart = array
          .slice(0, index)
          .reduceRight(
            (acc, p, i) => (p.isUnseen === post.isUnseen ? i : acc),
            0
          );
        const group = array
          .slice(groupStart)
          .filter((p) => p.isUnseen === post.isUnseen);
        return { ...post, random: Math.random() }; // Assign random for sorting within group
      })
      .sort((a, b) => {
        if (a.isUnseen !== b.isUnseen) return b.isUnseen - a.isUnseen; // Maintain overall order
        return a.random - b.random; // Randomize within group
      })
      .slice(0, parseInt(limit));

    await redis.set(cacheKey, JSON.stringify(shuffled), "EX", POST_CACHE_TTL);
    await addToPostsCacheSet(userId, cacheKey);

    res.json(shuffled);
  } catch (err) {
    logger.error(`Error fetching posts: ${err.message}`);
    handleServerError(res, err, "Failed to fetch posts");
  }
};

/**
 * Get Explore posts (posts with images or videos from non-followed users, similar to Instagram Explore)
 * - Fetches public posts with images or videos that are unseen by the user
 * - Uses batch queries to avoid N+1 problem
 * - Caches results with Redis
 * - Supports pagination
 * - Only includes public posts from non-followed users
 */
const getExplorePosts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.UserID;

    // Fetch the last view timestamp for cache key
    const lastView = await prisma.postView.findFirst({
      where: { UserID: userId },
      orderBy: { ViewedAt: "desc" },
      select: { ViewedAt: true },
    });
    const viewTimestamp = lastView?.ViewedAt?.getTime() || "0";

    const cacheKey = `explore:${userId}:${page}:${limit}:${viewTimestamp}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return res.json(JSON.parse(cached));
      } catch (err) {
        logger.error(`Cache parse error: ${err.message}`);
      }
    }

    // === Fetch non-followed users ===
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    // === Fetch unseen posts ===
    const viewedPostIds = await prisma.postView.findMany({
      where: { UserID: userId },
      select: { PostID: true },
    });
    const viewedIds = viewedPostIds.map((v) => v.PostID);

    // === Posts ===
    const posts = await prisma.post.findMany({
      skip: offset,
      take: parseInt(limit) * 2, // Fetch extra for filtering
      where: {
        OR: [
          { ImageURL: { not: null } }, // Posts with images
          { VideoURL: { not: null } }, // Posts with videos
        ],
        privacy: "PUBLIC", // Only public posts
        UserID: { notIn: followingIds }, // Exclude followed users
        PostID: { notIn: viewedIds }, // Exclude viewed posts
        CreatedAt: { gte: new Date(Date.now() - 700 * 24 * 60 * 60 * 1000) }, // Last 120 days
      },
      orderBy: { CreatedAt: "desc" },
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
            User: {
              select: { UserID: true, Username: true, ProfilePicture: true },
            },
          },
        },
        _count: { select: { Likes: true, Comments: true, Shares: true } },
      },
    });

    const postIds = posts.map((p) => p.PostID);

    if (!postIds.length) {
      await redis.set(cacheKey, JSON.stringify([]), "EX", POST_CACHE_TTL);
      await addToPostsCacheSet(userId, cacheKey);
      return res.json([]);
    }

    // === Batch Queries ===
    const [userLikes, userSaves, allLikes, allComments] = await Promise.all([
      prisma.like.findMany({
        where: { PostID: { in: postIds }, UserID: userId },
        select: { PostID: true },
      }),
      prisma.savedPost.findMany({
        where: { PostID: { in: postIds }, UserID: userId },
        select: { PostID: true },
      }),
      prisma.like.findMany({
        where: { PostID: { in: postIds } },
        orderBy: { CreatedAt: "desc" },
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
      }),
      prisma.comment.findMany({
        where: { PostID: { in: postIds }, ParentCommentID: null },
        orderBy: { CreatedAt: "desc" },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
          CommentLikes: {
            orderBy: { CreatedAt: "desc" },
            take: 3,
            include: {
              User: { select: { Username: true, ProfilePicture: true } },
            },
          },
          Replies: {
            orderBy: { CreatedAt: "asc" },
            take: 3,
            include: {
              User: {
                select: {
                  UserID: true,
                  Username: true,
                  ProfilePicture: true,
                },
              },
              CommentLikes: {
                orderBy: { CreatedAt: "asc" },
                take: 3,
                include: {
                  User: { select: { Username: true, ProfilePicture: true } },
                },
              },
              _count: { select: { CommentLikes: true } },
            },
          },
          _count: { select: { CommentLikes: true, Replies: true } },
        },
      }),
    ]);

    // === Group Data In Memory ===
    const likesByPost = groupBy(allLikes, (l) => l.PostID);
    const commentsByPost = groupBy(allComments, (c) => c.PostID);

    const formatted = posts.map((post) => {
      const isLiked = userLikes.some((l) => l.PostID === post.PostID);
      const isSaved = userSaves.some((s) => s.PostID === post.PostID);
      const isUnseen = !viewedIds.includes(post.PostID);; // All posts are unseen due to where clause
      const isFollowed = followingIds.includes(post.User.UserID);

      // === Likes ===
      const likes = likesByPost[post.PostID] || [];
      
      const myLike = likes.find((l) => l.User.UserID === userId);
      const followingLikes = likes.filter(
        (l) => followingIds.includes(l.User.UserID) && l.User.UserID !== userId
      );

      const Likes = [
        ...(myLike ? [myLike] : []),
        ...followingLikes.slice(0, myLike ? 9 : 10),
      ].map((like) => ({
        userId: like.User.UserID,
        username: like.User.Username,
        profileName: like.User.ProfileName,
        profilePicture: like.User.ProfilePicture,
        isFollowed: followingIds.includes(like.User.UserID),
        likedAt: like.CreatedAt.toISOString(),
      }));

      // === Comments ===
      const comments = (commentsByPost[post.PostID] || []).map((c) => ({
        ...c,
        priority:
          c.UserID === userId ? 0 : followingIds.includes(c.UserID) ? 1 : 2,
      }));

      const sortedComments = comments
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.CreatedAt - a.CreatedAt;
        })
        .slice(0, 3);

      const Comments = sortedComments.map((comment) => ({
        CommentID: comment.CommentID,
        Content: comment.Content,
        CreatedAt: comment.CreatedAt,
        User: comment.User,
        isMine: comment.UserID === userId,
        isLiked: comment.CommentLikes.some((l) => l.UserID === userId),
        likeCount: comment._count.CommentLikes,
        replyCount: comment._count.Replies,
        likedBy: comment.CommentLikes.map((l) => ({
          username: l.User.Username,
          profilePicture: l.User.ProfilePicture,
        })),
        Replies: comment.Replies.map((reply) => ({
          CommentID: reply.CommentID,
          Content: reply.Content,
          CreatedAt: reply.CreatedAt,
          User: reply.User,
          isMine: reply.UserID === userId,
          isLiked: reply.CommentLikes.some((l) => l.UserID === userId),
          likeCount: reply._count.CommentLikes,
          likedBy: reply.CommentLikes.map((l) => ({
            username: l.User.Username,
            profilePicture: l.User.ProfilePicture,
          })),
        })),
      }));

      return {
        ...post,
        isMine: post.User.UserID === userId,
        isLiked,
        isSaved,
        isUnseen,
        isFollowed,
        shareCount: post._count.Shares,
        likeCount: post._count.Likes,
        commentCount: post._count.Comments,
        Likes,
        Comments,
        SharedPost: post.SharedPost
          ? {
              ...post.SharedPost,
              User: post.SharedPost.User,
            }
          : null,
      };
    });

    // Sort by creation date (newest first) with randomization
    const shuffled = formatted
      .map((post) => ({ ...post, random: Math.random() }))
      .sort((a, b) => {
        return (
          b.CreatedAt.getTime() - a.CreatedAt.getTime() || a.random - b.random
        );
      })
      .slice(0, parseInt(limit));

    await redis.set(cacheKey, JSON.stringify(shuffled), "EX", POST_CACHE_TTL);
    await addToPostsCacheSet(userId, cacheKey);

    res.json(shuffled);
  } catch (err) {
    logger.error(`Error fetching explore posts: ${err.message}`);
    handleServerError(res, err, "Failed to fetch explore posts");
  }
};

/**
 * Get Flicks (video-only posts from followed and non-followed users, similar to Instagram Reels or YouTube Shorts)
 * - Fetches unseen video posts with isFollowed status for each post's user
 * - Uses batch queries to avoid N+1 problem
 * - Caches results with Redis
 * - Supports pagination
 * - Respects post privacy settings (PUBLIC or FOLLOWERS_ONLY for followed users)
 */
const getFlicks = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.UserID;

    // Fetch the last view timestamp for cache key
    const lastView = await prisma.postView.findFirst({
      where: { UserID: userId },
      orderBy: { ViewedAt: "desc" },
      select: { ViewedAt: true },
    });
    const viewTimestamp = lastView?.ViewedAt?.getTime() || "0";

    const cacheKey = `flicks:${userId}:${page}:${limit}:${viewTimestamp}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return res.json(JSON.parse(cached));
      } catch (err) {
        logger.error(`Cache parse error: ${err.message}`);
      }
    }

    // === Followings ===
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true, User: { select: { IsPrivate: true } } },
    });
    const followingIds = following.map((f) => f.UserID);

    // === Fetch unseen posts ===
    const viewedPostIds = await prisma.postView.findMany({
      where: { UserID: userId },
      select: { PostID: true },
    });
    const viewedIds = viewedPostIds.map((v) => v.PostID);

    // === Posts ===
    const posts = await prisma.post.findMany({
      skip: offset,
      take: parseInt(limit) * 2, // Fetch extra for filtering
      where: {
        VideoURL: { not: null }, // Only posts with videos
        privacy: { in: ["PUBLIC", "FOLLOWERS_ONLY"] }, // Respect privacy
        // PostID: { notIn: viewedIds }, // Exclude viewed posts
        CreatedAt: { gte: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000) }, // Last 730 days
      },
      orderBy: { CreatedAt: "desc" },
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
            User: {
              select: { UserID: true, Username: true, ProfilePicture: true },
            },
          },
        },
        _count: { select: { Likes: true, Comments: true, Shares: true } },
      },
    });

    // Filter posts based on privacy
    const filteredPosts = posts.filter(p => {
      if (p.privacy === "PUBLIC") return true;

      if (p.privacy === "FOLLOWERS_ONLY") {
        return followingIds.includes(p.User.UserID);
      }

      return false;
    });

    const postIds = filteredPosts.map((p) => p.PostID);

    if (!postIds.length) {
      await redis.set(cacheKey, JSON.stringify([]), "EX", POST_CACHE_TTL);
      await addToPostsCacheSet(userId, cacheKey);
      return res.json([]);
    }

    // === Batch Queries ===
    const [userLikes, userSaves, allLikes, allComments] = await Promise.all([
      prisma.like.findMany({
        where: { PostID: { in: postIds }, UserID: userId },
        select: { PostID: true },
      }),
      prisma.savedPost.findMany({
        where: { PostID: { in: postIds }, UserID: userId },
        select: { PostID: true },
      }),
      prisma.like.findMany({
        where: { PostID: { in: postIds } },
        orderBy: { CreatedAt: "desc" },
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
      }),
      prisma.comment.findMany({
        where: { PostID: { in: postIds }, ParentCommentID: null },
        orderBy: { CreatedAt: "desc" },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
          CommentLikes: {
            orderBy: { CreatedAt: "desc" },
            take: 3,
            include: {
              User: { select: { Username: true, ProfilePicture: true } },
            },
          },
          Replies: {
            orderBy: { CreatedAt: "asc" },
            take: 3,
            include: {
              User: {
                select: {
                  UserID: true,
                  Username: true,
                  ProfilePicture: true,
                },
              },
              CommentLikes: {
                orderBy: { CreatedAt: "asc" },
                take: 3,
                include: {
                  User: { select: { Username: true, ProfilePicture: true } },
                },
              },
              _count: { select: { CommentLikes: true } },
            },
          },
          _count: { select: { CommentLikes: true, Replies: true } },
        },
      }),
    ]);

    // === Group Data In Memory ===
    const likesByPost = groupBy(allLikes, (l) => l.PostID);
    const commentsByPost = groupBy(allComments, (c) => c.PostID);

    const formatted = filteredPosts.map((post) => {
      const isLiked = userLikes.some((l) => l.PostID === post.PostID);
      const isSaved = userSaves.some((s) => s.PostID === post.PostID);
      const isUnseen = true; // All posts are unseen due to where clause
      const isFollowed = followingIds.includes(post.User.UserID); // Add isFollowed for post's user

      // === Likes ===
      const likes = likesByPost[post.PostID] || [];

      const myLike = likes.find((l) => l.User.UserID === userId);
      const followingLikes = likes.filter(
        (l) => followingIds.includes(l.User.UserID) && l.User.UserID !== userId
      );

      const Likes = [
        ...(myLike ? [myLike] : []),
        ...followingLikes.slice(0, myLike ? 9 : 10),
      ].map((like) => ({
        userId: like.User.UserID,
        username: like.User.Username,
        profileName: like.User.ProfileName,
        profilePicture: like.User.ProfilePicture,
        isFollowed: followingIds.includes(like.User.UserID),
        likedAt: like.CreatedAt.toISOString(),
      }));

      // === Comments ===
      const comments = (commentsByPost[post.PostID] || []).map((c) => ({
        ...c,
        priority:
          c.UserID === userId ? 0 : followingIds.includes(c.UserID) ? 1 : 2,
      }));

      const sortedComments = comments
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.CreatedAt - a.CreatedAt;
        })
        .slice(0, 3);

      const Comments = sortedComments.map((comment) => ({
        CommentID: comment.CommentID,
        Content: comment.Content,
        CreatedAt: comment.CreatedAt,
        User: comment.User,
        isMine: comment.UserID === userId,
        isLiked: comment.CommentLikes.some((l) => l.UserID === userId),
        likeCount: comment._count.CommentLikes,
        replyCount: comment._count.Replies,
        likedBy: comment.CommentLikes.map((l) => ({
          username: l.User.Username,
          profilePicture: l.User.ProfilePicture,
        })),
        Replies: comment.Replies.map((reply) => ({
          CommentID: reply.CommentID,
          Content: reply.Content,
          CreatedAt: reply.CreatedAt,
          User: reply.User,
          isMine: reply.UserID === userId,
          isLiked: reply.CommentLikes.some((l) => l.UserID === userId),
          likeCount: reply._count.CommentLikes,
          likedBy: reply.CommentLikes.map((l) => ({
            username: l.User.Username,
            profilePicture: l.User.ProfilePicture,
          })),
        })),
      }));

      return {
        ...post,
        isMine: post.User.UserID === userId,
        isLiked,
        isSaved,
        isUnseen,
        isFollowed, // Include isFollowed for the post's user
        shareCount: post._count.Shares,
        likeCount: post._count.Likes,
        commentCount: post._count.Comments,
        Likes,
        Comments,
        SharedPost: post.SharedPost
          ? {
              ...post.SharedPost,
              User: post.SharedPost.User,
            }
          : null,
      };
    });

    // Sort by creation date (newest first) with randomization
    const shuffled = formatted
      .map((post) => ({ ...post, random: Math.random() }))
      .sort((a, b) => {
        return (
          b.CreatedAt.getTime() - a.CreatedAt.getTime() || a.random - b.random
        );
      })
      .slice(0, parseInt(limit));

    await redis.set(cacheKey, JSON.stringify(shuffled), "EX", POST_CACHE_TTL);
    await addToPostsCacheSet(userId, cacheKey);

    res.json(shuffled);
  } catch (err) {
    logger.error(`Error fetching flicks: ${err.message}`);
    handleServerError(res, err, "Failed to fetch flicks");
  }
};

/**
 * Endpoint to record multiple post views for a user in a single request
 * - Uses upsert to prevent duplicate views
 * - Optimized for batch processing to reduce server load
 * - Returns success response without fetching additional data
 */
const createBatchPostViews = async (req, res) => {
  try {
    const { postIds } = req.body; // Array of PostIDs
    const userId = req.user.UserID;

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res
        .status(400)
        .json({ error: "postIds must be a non-empty array" });
    }

    // Create array of upsert operations for batch processing
    const upsertOperations = postIds.map((postId) => ({
      where: {
        PostID_UserID: { PostID: postId, UserID: userId },
      },
      create: {
        PostID: postId,
        UserID: userId,
        ViewedAt: new Date(),
      },
      update: {}, // No update needed if view exists
    }));

    // Execute all upserts in a transaction for atomicity
    await prisma.$transaction(
      upsertOperations.map((op) => prisma.postView.upsert(op))
    );

    res.status(200).json({ message: "Post views recorded successfully" });
  } catch (err) {
    logger.error(`Error recording batch post views: ${err.message}`);
    handleServerError(res, err, "Failed to record post views");
  }
};

/**
 * Fetches a single post with optimized queries
 * - Includes privacy checks, comment likes, replies, and share count
 * - Returns up to 10 likes (prioritize: viewer → followed users → others)
 * - Returns up to 3 comments (prioritize: viewer → followed users → others)
 * - Returns up to 3 replies per comment (latest first)
 */
const getPostById = async (req, res) => {
  const { postId } = req.params;
  const viewerId = req.user ? req.user.UserID : null;

  try {
    const cacheKey = `post:${postId}`;
    const cachedPost = await redis.get(cacheKey);
    if (cachedPost) {
      try {
        const parsed = JSON.parse(cachedPost);
        logger.info(`Cache hit for post: ${cacheKey}`);
        return res.json(parsed);
      } catch (err) {
        logger.error(`Cache parse error for ${cacheKey}: ${err.message}`);
      }
    }
    logger.info(`Cache miss for post: ${cacheKey}`);

    // Get viewer's following
    const following = viewerId
      ? await prisma.follower.findMany({
          where: { FollowerUserID: viewerId, Status: "ACCEPTED" },
          select: { UserID: true },
        })
      : [];
    const followingIds = new Set(following.map((f) => f.UserID));

    // Fetch core post
    const post = await prisma.post.findUnique({
      where: { PostID: parseInt(postId) },
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
            User: {
              select: { UserID: true, Username: true, ProfilePicture: true },
            },
          },
        },
        _count: { select: { Likes: true, Comments: true, Shares: true } },
      },
    });

    if (!post) return res.status(404).json({ message: "Post not found" });

    // Privacy check
    if (post.privacy === "FOLLOWERS_ONLY" && viewerId !== post.UserID) {
      if (!viewerId)
        return res.status(403).json({ message: "Authentication required" });
      const isFollower = await prisma.follower.findFirst({
        where: {
          FollowerUserID: viewerId,
          UserID: post.UserID,
          Status: "ACCEPTED",
        },
      });
      if (!isFollower)
        return res.status(403).json({ message: "Post is private" });
    }

    // Parallel queries
    const [likes, comments, isSaved] = await Promise.all([
      prisma.like.findMany({
        where: { PostID: post.PostID },
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
        orderBy: { CreatedAt: "desc" },
        take: 30, // fetch more, trim to 10 after sorting
      }),
      prisma.comment.findMany({
        where: { PostID: post.PostID, ParentCommentID: null },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
          CommentLikes: {
            orderBy: { CreatedAt: "desc" },
            take: 3,
            include: {
              User: { select: { Username: true, ProfilePicture: true } },
            },
          },
          Replies: {
            orderBy: { CreatedAt: "asc" },
            take: 3,
            include: {
              User: {
                select: { UserID: true, Username: true, ProfilePicture: true },
              },
              CommentLikes: {
                orderBy: { CreatedAt: "asc" },
                take: 3,
                include: {
                  User: { select: { Username: true, ProfilePicture: true } },
                },
              },
              _count: { select: { CommentLikes: true } },
            },
          },
          _count: { select: { CommentLikes: true, Replies: true } },
        },
        orderBy: { CreatedAt: "desc" },
        take: 20, // fetch more, trim to 3 after sorting
      }),
      viewerId
        ? prisma.savedPost.findFirst({
            where: { PostID: post.PostID, UserID: viewerId },
          })
        : null,
    ]);

    // Likes: viewer first, then following only, max 10
    const myLike = likes.find((l) => l.UserID === viewerId);
    const followingLikes = likes.filter(
      (l) => followingIds.has(l.UserID) && l.UserID !== viewerId
    );

    const sortedLikes = [
      ...(myLike ? [myLike] : []),
      ...followingLikes.slice(0, myLike ? 9 : 10),
    ].map((like) => ({
      userId: like.User.UserID,
      username: like.User.Username,
      profileName: like.User.ProfileName,
      profilePicture: like.User.ProfilePicture,
      isFollowed: followingIds.has(like.User.UserID),
      likedAt: like.CreatedAt.toISOString(),
    }));


    // Sort comments by priority: viewer → following → others
    const sortedComments = comments
      .map((c) => ({
        ...c,
        priority:
          c.UserID === viewerId ? 0 : followingIds.has(c.UserID) ? 1 : 2,
      }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.CreatedAt - a.CreatedAt;
      })
      .slice(0, 3);

    // Format comments + replies
    const formattedComments = sortedComments.map((comment) => ({
      CommentID: comment.CommentID,
      Content: comment.Content,
      CreatedAt: comment.CreatedAt,
      User: comment.User,
      isMine: viewerId === comment.UserID,
      isLiked: viewerId
        ? comment.CommentLikes.some((l) => l.UserID === viewerId)
        : false,
      likeCount: comment._count.CommentLikes,
      replyCount: comment._count.Replies,
      likedBy: comment.CommentLikes.map((l) => ({
        username: l.User.Username,
        profilePicture: l.User.ProfilePicture,
      })),
      Replies: comment.Replies.map((reply) => ({
        CommentID: reply.CommentID,
        Content: reply.Content,
        CreatedAt: reply.CreatedAt,
        User: reply.User,
        isMine: viewerId === reply.UserID,
        isLiked: viewerId
          ? reply.CommentLikes.some((l) => l.UserID === viewerId)
          : false,
        likeCount: reply._count.CommentLikes,
        likedBy: reply.CommentLikes.map((l) => ({
          username: l.User.Username,
          profilePicture: l.User.ProfilePicture,
        })),
      })),
    }));
    

    const response = {
      post: {
        ...post,
        isMine: viewerId === post.UserID,
        isLiked: viewerId ? likes.some((l) => l.UserID === viewerId) : false,
        isSaved: !!isSaved,
        likeCount: post._count.Likes,
        commentCount: post._count.Comments,
        shareCount: post._count.Shares,
        Likes: sortedLikes.map((like) => ({
          userId: like.User.UserID,
          username: like.User.Username,
          profileName: like.User.ProfileName,
          profilePicture: like.User.ProfilePicture,
          isFollowed: followingIds.has(like.User.UserID),
          likedAt: like.CreatedAt,
        })),
        Comments: formattedComments,
        SharedPost: post.SharedPost
          ? {
              ...post.SharedPost,
              User: {
                UserID: post.SharedPost.User.UserID,
                Username: post.SharedPost.User.Username,
                ProfilePicture: post.SharedPost.User.ProfilePicture,
              },
            }
          : null,
      },
    };

    // Cache result
    try {
      await redis.set(cacheKey, JSON.stringify(response), "EX", POST_CACHE_TTL);
      if (viewerId) await addToPostsCacheSet(viewerId, cacheKey);
    } catch (err) {
      logger.error(`Failed to cache post ${cacheKey}: ${err.message}`);
    }

    res.json(response);
  } catch (err) {
    logger.error(`Error retrieving post ${postId}: ${err.message}`);
    res
      .status(500)
      .json({ message: "Error retrieving post", error: err.message });
  }
};

/**
 * Updates post content
 * Validates content safety via middleware
 * Restricts for private accounts
 */
const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user.UserID;

    const updatedPost = await prisma.$transaction(async (tx) => {
      // Verify post exists and get owner details
      const post = await tx.post.findUnique({
        where: { PostID: parseInt(postId) },
        select: {
          UserID: true,
          User: {
            select: {
              IsPrivate: true,
              Username: true,
            },
          },
        },
      });

      if (!post) {
        logger.info(`Post ${postId} not found for update by user ${userId}`);
        throw new Error("Post not found");
      }

      // Check access for private accounts
      if (post.User.IsPrivate && post.UserID !== userId) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to update private post ${postId}`
          );
          throw new Error(
            `You must follow @${post.User.Username} to update their posts`
          );
        }
      }

      // Ensure only the post owner can update
      if (post.UserID !== userId) {
        logger.info(`User ${userId} unauthorized to update post ${postId}`);
        throw new Error("Unauthorized to update this post");
      }

      // Update post
      return await tx.post.update({
        where: { PostID: parseInt(postId) },
        data: { Content: content || null },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
        },
      });
    });

    // Clear cache after transaction
    await clearPostsCache(userId, postId);

    res.json({
      ...updatedPost,
      isMine: updatedPost.User.UserID === userId,
    });
  } catch (error) {
    logger.error(`Error updating post ${req.params.postId}: ${error.message}`);
    handleServerError(res, error, "Failed to update post");
  }
};

/**
 * Deletes a post and related data
 * Only allows the post owner to delete
 */
const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.UserID;

    // Validate postId
    if (!postId || isNaN(parseInt(postId))) {
      logger.info(`Invalid postId received: ${postId} by user ${userId}`);
      throw new Error("Invalid post ID");
    }

    const parsedPostId = parseInt(postId);
    logger.info(`Attempting to delete post ${parsedPostId} by user ${userId}`);

    await prisma.$transaction(async (tx) => {
      // Verify post exists and get owner details
      const post = await tx.post.findUnique({
        where: { PostID: parsedPostId },
        select: {
          UserID: true,
          User: {
            select: {
              Username: true,
            },
          },
        },
      });

      if (!post) {
        logger.info(
          `Post ${parsedPostId} not found for deletion by user ${userId}`
        );
        throw new Error("Post not found");
      }

      // Validate user is the post owner
      if (post.UserID !== userId) {
        logger.info(
          `User ${userId} unauthorized to delete post ${parsedPostId}`
        );
        throw new Error("Only the post owner can delete this post");
      }

      // Delete post and related data
      await tx.commentLike.deleteMany({
        where: { Comment: { PostID: parsedPostId } },
      });
      await tx.comment.deleteMany({ where: { PostID: parsedPostId } });
      await tx.like.deleteMany({ where: { PostID: parsedPostId } });
      await tx.savedPost.deleteMany({ where: { PostID: parsedPostId } });
      await tx.report.deleteMany({ where: { PostID: parsedPostId } });
      await tx.post.delete({
        where: { PostID: parsedPostId },
      });
      await tx.auditLog.create({
        data: {
          Action: "DELETE_POST",
          UserID: userId,
          Details: JSON.stringify({
            postId: parsedPostId,
            deletedBy: "owner",
          }),
        },
      });
    });

    // Clear cache after transaction
    await clearPostsCache(userId, parsedPostId);

    res.json({ success: true });
  } catch (error) {
    logger.error(
      `Error deleting post ${req.params.postId || "unknown"}: ${error.message}`
    );
    handleServerError(res, error, "Failed to delete post");
  }
};

/**
 * Toggles like status on a post
 * Creates notifications, restricts for private accounts
 */
const likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.UserID;

    const result = await prisma.$transaction(async (tx) => {
      // Verify post exists and get owner details
      const post = await tx.post.findUnique({
        where: { PostID: parseInt(postId) },
        select: {
          UserID: true,
          User: {
            select: {
              IsPrivate: true,
              Username: true,
            },
          },
        },
      });

      if (!post) {
        logger.info(`Post ${postId} not found for like by user ${userId}`);
        throw new Error("Post not found");
      }

      // Check access for private accounts
      logger.info(
        `Checking privacy for like on post ${postId} by user ${userId}`
      );
      if (post.User.IsPrivate && post.UserID !== userId) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        logger.info(
          `Is user ${userId} following ${post.UserID}? ${isFollowed}`
        );
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to like private post ${postId}`
          );
          throw new Error(
            `You must follow @${post.User.Username} to like their posts`
          );
        }
      }

      // Toggle like
      const existingLike = await tx.like.findFirst({
        where: { PostID: parseInt(postId), UserID: userId },
      });

      if (existingLike) {
        await tx.like.delete({ where: { LikeID: existingLike.LikeID } });
        logger.info(`User ${userId} unliked post ${postId}`);
        return { action: "unliked" };
      } else {
        await tx.like.create({
          data: { PostID: parseInt(postId), UserID: userId },
        });
        await createLikeNotification(postId, userId, req.user.Username);
        logger.info(`User ${userId} liked post ${postId}`);
        return { action: "liked" };
      }
    });

    // Clear cache after transaction
    await clearPostsCache(userId, postId);

    res.json({ success: true, action: result.action });
  } catch (error) {
    logger.error(
      `Error toggling like for post ${req.params.postId}: ${error.message}`
    );
    handleServerError(res, error, "Failed to toggle like");
  }
};

/**
 * Toggles like status on a comment
 * Creates notifications, restricts for private accounts
 */
const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.UserID;

    const result = await prisma.$transaction(async (tx) => {
      // Verify comment exists and get post and owner details
      const comment = await tx.comment.findUnique({
        where: { CommentID: parseInt(commentId) },
        select: {
          UserID: true,
          PostID: true,
          Post: {
            select: {
              UserID: true,
              User: {
                select: {
                  IsPrivate: true,
                  Username: true,
                },
              },
            },
          },
        },
      });

      if (!comment) {
        logger.info(
          `Comment ${commentId} not found for like by user ${userId}`
        );
        throw new Error("Comment not found");
      }

      // Check access for private accounts
      logger.info(
        `Checking privacy for like on comment ${commentId} by user ${userId}`
      );
      if (comment.Post.User.IsPrivate && comment.Post.UserID !== userId) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: comment.Post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        logger.info(
          `Is user ${userId} following ${comment.Post.UserID}? ${isFollowed}`
        );
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to like comment ${commentId} on private post`
          );
          throw new Error(
            `You must follow @${comment.Post.User.Username} to like comments on their posts`
          );
        }
      }

      // Toggle like
      const existingLike = await tx.commentLike.findFirst({
        where: { CommentID: parseInt(commentId), UserID: userId },
      });

      if (existingLike) {
        await tx.commentLike.delete({
          where: { LikeID: existingLike.LikeID },
        });
        logger.info(`User ${userId} unliked comment ${commentId}`);
        return { action: "unliked", PostID: comment.PostID };
      } else {
        await tx.commentLike.create({
          data: { CommentID: parseInt(commentId), UserID: userId },
        });
        await createCommentLikeNotification(
          commentId,
          userId,
          req.user.Username
        );
        logger.info(`User ${userId} liked comment ${commentId}`);
        return { action: "liked", PostID: comment.PostID };
      }
    });

    // Clear cache after transaction
    await clearPostsCache(userId, result.PostID);

    res.json({ success: true, action: result.action });
  } catch (error) {
    logger.error(
      `Error toggling like for comment ${req.params.commentId}: ${error.message}`
    );
    handleServerError(res, error, "Failed to toggle like");
  }
};

/**
 * Adds a comment to a post
 * Notifies post owner, restricts for private accounts
 */
const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user.UserID;

    const comment = await prisma.$transaction(async (tx) => {
      // Verify post exists and get owner details
      const post = await tx.post.findUnique({
        where: { PostID: parseInt(postId) },
        select: {
          UserID: true,
          User: {
            select: {
              IsPrivate: true,
              Username: true,
            },
          },
        },
      });

      if (!post) {
        logger.info(`Post ${postId} not found for comment by user ${userId}`);
        throw new Error("Post not found");
      }

      // Check access for private accounts
      logger.info(
        `Checking privacy for comment on post ${postId} by user ${userId}`
      );
      if (post.User.IsPrivate && post.UserID !== userId) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        logger.info(
          `Is user ${userId} following ${post.UserID}? ${isFollowed}`
        );
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to comment on private post ${postId}`
          );
          throw new Error(
            `You must follow @${post.User.Username} to comment on their posts`
          );
        }
      }

      // Create comment
      const newComment = await tx.comment.create({
        data: {
          PostID: parseInt(postId),
          UserID: userId,
          Content: content || null,
        },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
        },
      });

      // Notify post owner
      if (post.UserID !== userId) {
        await createCommentNotification(
          postId,
          userId,
          post.UserID,
          req.user.Username
        );
        logger.info(
          `Notification sent for comment on post ${postId} by user ${userId}`
        );
      }

      return newComment;
    });

    // Clear cache after transaction
    await clearPostsCache(userId, postId);

    res.status(201).json(comment);
  } catch (error) {
    logger.error(
      `Error adding comment to post ${req.params.postId}: ${error.message}`
    );
    handleServerError(res, error, "Failed to add comment");
  }
};

/**
 * Adds a reply to a comment
 * Notifies comment owner, restricts for private accounts
 */
const replyToComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.UserID;

    const reply = await prisma.$transaction(async (tx) => {
      // Verify comment exists and get post and owner details
      const parentComment = await tx.comment.findUnique({
        where: { CommentID: parseInt(commentId) },
        select: {
          UserID: true,
          PostID: true,
          Post: {
            select: {
              UserID: true,
              User: {
                select: {
                  IsPrivate: true,
                  Username: true,
                },
              },
            },
          },
        },
      });

      if (!parentComment) {
        logger.info(
          `Comment ${commentId} not found for reply by user ${userId}`
        );
        throw new Error("Comment not found");
      }

      // Check access for private accounts
      logger.info(
        `Checking privacy for reply on comment ${commentId} by user ${userId}`
      );
      if (
        parentComment.Post.User.IsPrivate &&
        parentComment.Post.UserID !== userId
      ) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: parentComment.Post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        logger.info(
          `Is user ${userId} following ${parentComment.Post.UserID}? ${isFollowed}`
        );
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to reply to comment ${commentId} on private post`
          );
          throw new Error(
            `You must follow @${parentComment.Post.User.Username} to reply to comments on their posts`
          );
        }
      }

      // Create reply
      const newReply = await tx.comment.create({
        data: {
          PostID: parentComment.PostID,
          UserID: userId,
          Content: content || null,
          ParentCommentID: parseInt(commentId),
        },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
        },
      });

      // Notify parent comment owner
      if (parentComment.UserID !== userId) {
        await createCommentReplyNotification(
          commentId,
          userId,
          parentComment.UserID,
          req.user.Username
        );
        logger.info(
          `Notification sent for reply to comment ${commentId} by user ${userId}`
        );
      }

      return newReply;
    });

    // Clear cache after transaction
    await clearPostsCache(userId, reply.PostID);

    res.status(201).json(reply);
  } catch (error) {
    logger.error(
      `Error adding reply to comment ${req.params.commentId}: ${error.message}`
    );
    handleServerError(res, error, "Failed to add reply");
  }
};

/**
 * Edits an existing comment
 * Only the comment owner can edit
 * Respects privacy settings for private accounts
 * Notifies post owner or parent comment owner if content changes significantly
 */
const editComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.UserID;

    const updatedComment = await prisma.$transaction(async (tx) => {
      // Verify comment exists and get post and owner details
      const comment = await tx.comment.findUnique({
        where: { CommentID: parseInt(commentId) },
        select: {
          UserID: true,
          PostID: true,
          Content: true,
          Post: {
            select: {
              UserID: true,
              User: {
                select: {
                  IsPrivate: true,
                  Username: true,
                },
              },
            },
          },
          ParentCommentID: true,
          ParentComment: {
            select: {
              UserID: true,
            },
          },
        },
      });

      if (!comment) {
        logger.info(
          `Comment ${commentId} not found for edit by user ${userId}`
        );
        throw new Error("Comment not found");
      }

      // Check if user is the comment owner
      if (comment.UserID !== userId) {
        logger.info(
          `User ${userId} not authorized to edit comment ${commentId}`
        );
        throw new Error("You are not authorized to edit this comment");
      }

      // Check access for private accounts
      logger.info(
        `Checking privacy for edit on comment ${commentId} by user ${userId}`
      );
      if (comment.Post.User.IsPrivate && comment.Post.UserID !== userId) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: comment.Post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        logger.info(
          `Is user ${userId} following ${comment.Post.UserID}? ${isFollowed}`
        );
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to edit comment ${commentId} on private post`
          );
          throw new Error(
            `You must follow @${comment.Post.User.Username} to edit comments on their posts`
          );
        }
      }

      // Update comment
      const newContent = content || null;
      const updatedComment = await tx.comment.update({
        where: { CommentID: parseInt(commentId) },
        data: {
          Content: newContent,
        },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
        },
      });

      // Notify post owner or parent comment owner if content changed significantly
      if (newContent !== comment.Content && newContent !== null) {
        if (comment.Post.UserID !== userId) {
          await createCommentNotification(
            comment.PostID,
            userId,
            comment.Post.UserID,
            req.user.Username,
            "edited"
          );
          logger.info(
            `Notification sent for edited comment ${commentId} on post ${comment.PostID} by user ${userId}`
          );
        }
        if (
          comment.ParentCommentID &&
          comment.ParentComment.UserID !== userId
        ) {
          await createCommentReplyNotification(
            commentId,
            userId,
            comment.ParentComment.UserID,
            req.user.Username,
            "edited"
          );
          logger.info(
            `Notification sent for edited reply ${commentId} by user ${userId}`
          );
        }
      }

      return updatedComment;
    });

    // Clear cache after transaction
    await clearPostsCache(userId, updatedComment.PostID);

    res.status(200).json(updatedComment);
  } catch (error) {
    logger.error(
      `Error editing comment ${req.params.commentId}: ${error.message}`
    );
    handleServerError(res, error, "Failed to edit comment");
  }
};

/**
 * Deletes a comment
 * Only the comment owner or post owner can delete
 * Deletes all nested replies
 * Respects privacy settings for private accounts
 */
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.UserID;

    let postId;

    await prisma.$transaction(async (tx) => {
      // Verify comment exists and get post and owner details
      const comment = await tx.comment.findUnique({
        where: { CommentID: parseInt(commentId) },
        select: {
          UserID: true,
          PostID: true,
          Post: {
            select: {
              UserID: true,
              User: {
                select: {
                  IsPrivate: true,
                  Username: true,
                },
              },
            },
          },
        },
      });

      if (!comment) {
        logger.info(
          `Comment ${commentId} not found for deletion by user ${userId}`
        );
        throw new Error("Comment not found");
      }

      // Check if user is the comment owner or post owner
      if (comment.UserID !== userId && comment.Post.UserID !== userId) {
        logger.info(
          `User ${userId} not authorized to delete comment ${commentId}`
        );
        throw new Error("You are not authorized to delete this comment");
      }

      // Check access for private accounts (if not post owner)
      if (comment.Post.User.IsPrivate && comment.Post.UserID !== userId) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: comment.Post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        logger.info(
          `Is user ${userId} following ${comment.Post.UserID}? ${isFollowed}`
        );
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to delete comment ${commentId} on private post`
          );
          throw new Error(
            `You must follow @${comment.Post.User.Username} to delete comments on their posts`
          );
        }
      }

      postId = comment.PostID;

      // Delete comment and its replies (Prisma handles cascading deletion if configured)
      await tx.comment.delete({
        where: { CommentID: parseInt(commentId) },
      });
      logger.info(`Comment ${commentId} deleted by user ${userId}`);
    });

    if (postId) {
      await clearPostsCache(userId, postId);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error(
      `Error deleting comment ${req.params.commentId}: ${error.message}`
    );
    handleServerError(res, error, "Failed to delete comment");
  }
};

/**
 * Toggles save status on a post
 * Restricts for private accounts
 */
const savePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.UserID;

    const result = await prisma.$transaction(async (tx) => {
      // Verify post exists and get owner details
      const post = await tx.post.findUnique({
        where: { PostID: parseInt(postId) },
        select: {
          UserID: true,
          User: {
            select: {
              IsPrivate: true,
              Username: true,
            },
          },
        },
      });

      if (!post) {
        logger.info(`Post ${postId} not found for save by user ${userId}`);
        throw new Error("Post not found");
      }

      // Check access for private accounts
      logger.info(
        `Checking privacy for save on post ${postId} by user ${userId}`
      );
      if (post.User.IsPrivate && post.UserID !== userId) {
        const isFollowed = await tx.follower.count({
          where: {
            UserID: post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        logger.info(
          `Is user ${userId} following ${post.UserID}? ${isFollowed}`
        );
        if (!isFollowed) {
          logger.info(
            `User ${userId} denied access to save private post ${postId}`
          );
          throw new Error(
            `You must follow @${post.User.Username} to save their posts`
          );
        }
      }

      // Toggle save
      const existingSave = await tx.savedPost.findFirst({
        where: { PostID: parseInt(postId), UserID: userId },
      });

      if (existingSave) {
        await tx.savedPost.delete({
          where: { SavedPostID: existingSave.SavedPostID },
        });
        logger.info(`User ${userId} unsaved post ${postId}`);
        return { action: "unsaved" };
      } else {
        await tx.savedPost.create({
          data: { PostID: parseInt(postId), UserID: userId },
        });
        logger.info(`User ${userId} saved post ${postId}`);
        return { action: "saved" };
      }
    });

    // Clear cache after transaction
    await clearPostsCache(userId, postId);

    res.json({ success: true, action: result.action });
  } catch (error) {
    logger.error(
      `Error toggling save for post ${req.params.postId}: ${error.message}`
    );
    handleServerError(res, error, "Failed to toggle save");
  }
};

/**
 * Reports a post to admins
 * Prevents duplicate reports
 */
const reportPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { reason } = req.body;
    const userId = req.user.UserID;

    const result = await prisma.$transaction(async (tx) => {
      const parsedPostId = parseInt(postId);
      if (isNaN(parsedPostId)) throw new Error("Invalid post ID");
      if (!reason || typeof reason !== "string" || reason.trim() === "") {
        throw new Error("Reason is required");
      }

      const post = await tx.post.findUnique({
        where: { PostID: parsedPostId },
        select: {
          PostID: true,
          UserID: true,
          User: { select: { IsPrivate: true, Username: true } },
        },
      });
      if (!post) throw new Error("Post not found");

      // Access check
      const isOwner = userId === post.UserID;
      let hasAccess = !post.User.IsPrivate || isOwner;
      if (post.User.IsPrivate && !isOwner) {
        const followRelationship = await tx.follower.findFirst({
          where: {
            UserID: post.UserID,
            FollowerUserID: userId,
            Status: "ACCEPTED",
          },
        });
        hasAccess = !!followRelationship;
      }
      if (!hasAccess)
        throw new Error(
          `You must follow @${post.User.Username} to report their posts`
        );

      // Check existing report
      let report = await tx.report.findFirst({
        where: { PostID: parsedPostId, ReporterID: userId },
      });

      if (!report) {
        // Create report only if not exists
        report = await tx.report.create({
          data: {
            PostID: parsedPostId,
            ReporterID: userId,
            Reason: reason.trim(),
            Status: "PENDING",
          },
        });

        // Notify admins only for first report
        await notifyAdminsAboutReport(
          parsedPostId,
          userId,
          reason.trim(),
          req.user.Username
        );
      }

      return report;
    });

    await clearPostsCache(userId, result.PostID);

    res.status(201).json({
      message: "Post reported successfully",
      reportId: result.ReportID,
    });
  } catch (error) {
    logger.error(`Error reporting post ${req.params.postId}: ${error.message}`);
    handleServerError(res, error, "Failed to report post");
  }
};

/**
 * Shares a post by creating a new post referencing the original
 * Adds optional caption, does not copy media, respects privacy
 * Links to the root post if the shared post is itself a share
 * Notifies original post owner
 */
const sharePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { caption } = req.body; // Optional caption
    const userId = req.user.UserID;

    let rootPostId, rootPostOwnerId, rootPostUsername; // Define variables outside transaction
    const sharedPost = await prisma.$transaction(async (tx) => {
      // Verify original post exists and get details, including SharedPostID
      const originalPost = await tx.post.findUnique({
        where: { PostID: parseInt(postId) },
        select: {
          PostID: true,
          UserID: true,
          privacy: true,
          SharedPostID: true, // Include SharedPostID to check if it's a share
          User: {
            select: {
              IsPrivate: true,
              Username: true,
            },
          },
        },
      });

      if (!originalPost) {
        logger.info(`Post ${postId} not found for share by user ${userId}`);
        throw new Error("Post not found");
      }

      // Initialize root post details
      rootPostId = originalPost.PostID;
      rootPostOwnerId = originalPost.UserID;
      rootPostUsername = originalPost.User.Username;

      if (originalPost.SharedPostID) {
        // If the post is a share, fetch the root post to check its privacy and owner
        const rootPost = await tx.post.findUnique({
          where: { PostID: originalPost.SharedPostID },
          select: {
            PostID: true,
            UserID: true,
            User: {
              select: {
                IsPrivate: true,
                Username: true,
              },
            },
          },
        });

        if (!rootPost) {
          logger.info(
            `Root post ${originalPost.SharedPostID} not found for share by user ${userId}`
          );
          throw new Error("Root post not found");
        }

        rootPostId = rootPost.PostID;
        rootPostOwnerId = rootPost.UserID;
        rootPostUsername = rootPost.User.Username;

        // Check access for the root post's privacy
        logger.info(
          `Checking privacy for root post ${rootPostId} by user ${userId}`
        );
        if (rootPost.User.IsPrivate && rootPost.UserID !== userId) {
          const isFollowed = await tx.follower.count({
            where: {
              UserID: rootPost.UserID,
              FollowerUserID: userId,
              Status: "ACCEPTED",
            },
          });
          logger.info(
            `Is user ${userId} following ${rootPost.UserID}? ${isFollowed}`
          );
          if (!isFollowed) {
            logger.info(
              `User ${userId} denied access to share private root post ${rootPostId}`
            );
            throw new Error(
              `You must follow @${rootPost.User.Username} to share their posts`
            );
          }
        }
      } else {
        // If the post is not a share, check access for the original post's privacy
        logger.info(
          `Checking privacy for original post ${postId} by user ${userId}`
        );
        if (originalPost.User.IsPrivate && originalPost.UserID !== userId) {
          const isFollowed = await tx.follower.count({
            where: {
              UserID: originalPost.UserID,
              FollowerUserID: userId,
              Status: "ACCEPTED",
            },
          });
          logger.info(
            `Is user ${userId} following ${originalPost.UserID}? ${isFollowed}`
          );
          if (!isFollowed) {
            logger.info(
              `User ${userId} denied access to share private post ${postId}`
            );
            throw new Error(
              `You must follow @${originalPost.User.Username} to share their posts`
            );
          }
        }
      }

      // Fetch current user's privacy
      const user = await tx.user.findUnique({
        where: { UserID: userId },
        select: { IsPrivate: true },
      });

      // Create shared post linking to the root post
      const newPost = await tx.post.create({
        data: {
          UserID: userId,
          Content: caption || "", // Use caption as content
          privacy: user.IsPrivate ? "FOLLOWERS_ONLY" : "PUBLIC",
          SharedPostID: rootPostId, // Link to the root post
        },
        include: {
          User: {
            select: { UserID: true, Username: true, ProfilePicture: true },
          },
          SharedPost: {
            include: {
              User: {
                select: { UserID: true, Username: true, ProfilePicture: true },
              },
            },
          },
        },
      });

      // Notify the root post owner if not the same user
      if (rootPostOwnerId !== userId) {
        await createShareNotification(
          rootPostId,
          userId,
          rootPostOwnerId,
          req.user.Username
        );
        logger.info(
          `Notification sent for share of root post ${rootPostId} by user ${userId}`
        );
      }

      return newPost;
    });

    // Clear cache for the new shared post and root post
    await clearPostsCache(userId, sharedPost.PostID);
    await clearPostsCache(userId, rootPostId); // Use defined rootPostId

    res.status(201).json({
      message: "Post shared successfully",
      post: sharedPost,
    });
  } catch (error) {
    logger.error(`Error sharing post ${req.params.postId}: ${error.message}`);
    handleServerError(res, error, "Failed to share post");
  }
};


// Helper function to check if user can view the post (reused from getPostById logic)
async function canViewPost(userId, post) {
  if (post.privacy === "PUBLIC") return true;
  if (post.UserID === userId) return true;

  if (post.privacy === "FOLLOWERS_ONLY") {
    const isFollower = await prisma.follower.findFirst({
      where: {
        UserID: post.UserID,
        FollowerUserID: userId,
        Status: "ACCEPTED",
      },
    });
    return !!isFollower;
  }

  return false; // For PRIVATE
}

/**
 * Get post likers with pagination
 * - Excludes likes already returned in getPosts/getPostById (current user + followed users)
 * - Prioritizes: viewer first → followed users → others
 * - Supports pagination
 * - Adds isFollowed flag
 */
const getPostLikers = async (req, res) => {
  const { postId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;
  const userId = req.user.UserID;
  const parsedPostId = parseInt(postId);

  try {
    // Check post existence and privacy
    const post = await prisma.post.findUnique({
      where: { PostID: parsedPostId },
      select: { PostID: true, UserID: true, privacy: true },
    });
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (!(await canViewPost(userId, post))) {
      return res.status(403).json({ message: "No access to this post" });
    }

    // Get following IDs
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = new Set(following.map(f => f.UserID));

    // Get likes already returned in the post (viewer + followed users)
    const topLikes = await prisma.like.findMany({
      where: { PostID: parsedPostId },
      include: { User: { select: { UserID: true } } },
      orderBy: { CreatedAt: "desc" },
    });
    const topLikeUserIds = new Set(
      topLikes
        .filter(l => l.UserID === userId || followingIds.has(l.UserID))
        .map(l => l.UserID)
    );

    // Check cache
    const cacheKey = `post:${postId}:likers:page:${page}:limit:${limit}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return res.json(JSON.parse(cached));
      } catch (err) {
        logger.error(`Cache parse error for key ${cacheKey}: ${err.message}`);
        await redis.del(cacheKey);
      }
    }

    // Fetch remaining likers
    const remainingLikes = await prisma.like.findMany({
      where: {
        PostID: parsedPostId,
        UserID: { notIn: Array.from(topLikeUserIds) },
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
      orderBy: { CreatedAt: "desc" },
    });

    // Sort by priority: viewer (should not be here) → following → others
    // Viewer is excluded, so priority is: followed → others
    const followedLikes = remainingLikes.filter(l => followingIds.has(l.User.UserID));
    const othersLikes = remainingLikes.filter(l => !followingIds.has(l.User.UserID));

    const sortedLikes = [...followedLikes, ...othersLikes];

    // Apply pagination
    const paginatedLikes = sortedLikes.slice(skip, skip + parseInt(limit));

    // Format response
    const response = {
      likers: paginatedLikes.map(like => ({
        userId: like.User.UserID,
        username: like.User.Username,
        profileName: like.User.ProfileName,
        profilePicture: like.User.ProfilePicture,
        isFollowed: followingIds.has(like.User.UserID),
        likedAt: like.CreatedAt.toISOString(),
      })),
      total: sortedLikes.length,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(response), "EX", 300);

    res.json(response);

  } catch (err) {
    logger.error(`Error fetching likers for post ${postId}: ${err.message}`);
    res.status(500).json({ message: "Error fetching likers", error: err.message });
  }
};



/**
 * Gets top-level comments on a specific post with pagination, including nested replies
 * - Prioritizes current user first, then followed users, then others
 * - Excludes the 3 comments returned by getPostById to avoid duplication
 * - Adds `isFollowed` flag to each comment's user
 * - Nested replies sorted by oldest first, no special priority inside replies
 */
const getPostCommenters = async (req, res) => {
  const { postId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const parsedPostId = parseInt(postId);
  const parsedPage = parseInt(page);
  const parsedLimit = parseInt(limit);
  const skip = (parsedPage - 1) * parsedLimit;
  const userId = req.user.UserID;

  try {
    // Validate input
    if (isNaN(parsedPostId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ error: "Invalid page number" });
    }
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({ error: "Invalid limit" });
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { PostID: parsedPostId },
    });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Check privacy
    if (!(await canViewPost(userId, post))) {
      return res.status(403).json({ error: "No access to this post" });
    }

    // Get total top-level comment count for reference
    const totalTopLevelComments = await prisma.comment.count({
      where: { PostID: parsedPostId, ParentCommentID: null },
    });
    logger.debug(
      `Total top-level comments for post ${parsedPostId}: ${totalTopLevelComments}`
    );

    // Get following IDs
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = new Set(following.map((f) => f.UserID));

    // Get IDs of the first 3 top-level comments (same as getPostById)
    const topComments = await prisma.comment.findMany({
      where: { PostID: parsedPostId, ParentCommentID: null },
      orderBy: { CreatedAt: "desc" }, // Match getPostById sorting
      take: 3,
      select: { CommentID: true },
    });
    const excludeCommentIds = new Set(topComments.map((c) => c.CommentID));
    logger.debug(
      `Excluding comment IDs: ${Array.from(excludeCommentIds).join(", ")}`
    );

    // Redis cache key
    const cacheKey = `post:${parsedPostId}:comments:page:${parsedPage}:limit:${parsedLimit}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        logger.debug(
          `Cache hit for key ${cacheKey}, returning ${cachedData.comments.length} comments`
        );
        return res.json(cachedData);
      } catch (err) {
        logger.error(
          `Invalid JSON in cache for key ${cacheKey}: ${err.message}`
        );
        await redis.del(cacheKey);
      }
    }

    // Fetch all remaining top-level comments (excluding the first 3)
    const comments = await prisma.comment.findMany({
      where: {
        PostID: parsedPostId,
        ParentCommentID: null,
        CommentID: { notIn: Array.from(excludeCommentIds) },
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
        CommentLikes: {
          take: 3,
          orderBy: { CreatedAt: "desc" },
          include: {
            User: { select: { Username: true, ProfilePicture: true } },
          },
        },
        _count: { select: { CommentLikes: true, Replies: true } },
        Replies: {
          take: 3,
          include: {
            User: {
              select: {
                UserID: true,
                Username: true,
                ProfileName: true,
                ProfilePicture: true,
              },
            },
            CommentLikes: {
              take: 3,
              orderBy: { CreatedAt: "asc" },
              include: {
                User: { select: { Username: true, ProfilePicture: true } },
              },
            },
            _count: { select: { CommentLikes: true, Replies: true } },
          },
          orderBy: { CreatedAt: "asc" }, // Replies sorted oldest first
        },
      },
    });
    logger.debug(
      `Fetched ${comments.length} remaining comments for post ${parsedPostId}`
    );

    // Sort comments by priority: viewer → followed → others
    const sortedComments = comments
      .map((comment) => ({
        ...comment,
        priority:
          comment.UserID === userId
            ? 0
            : followingIds.has(comment.UserID)
            ? 1
            : 2,
      }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (
          new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()
        ); // Newest first within same priority
      });

    // Apply pagination
    const totalRemainingComments = comments.length;
    const pagedComments = sortedComments.slice(skip, skip + parsedLimit);
    logger.debug(
      `Returning ${pagedComments.length} comments for page ${parsedPage}, limit ${parsedLimit}`
    );

    // Format response
    const response = {
      comments: pagedComments.map((comment) => ({
        CommentID: comment.CommentID,
        PostID: comment.PostID,
        ParentCommentID: comment.ParentCommentID,
        User: {
          ...comment.User,
          isFollowed: followingIds.has(comment.User.UserID),
        },
        Content: comment.Content,
        CreatedAt: comment.CreatedAt.toISOString(),
        likeCount: comment._count.CommentLikes,
        replyCount: comment._count.Replies,
        isMine: comment.User.UserID === userId,
        isLiked: comment.CommentLikes.some((like) => like.UserID === userId),
        likedBy: comment.CommentLikes.map((like) => ({
          username: like.User.Username,
          profilePicture: like.User.ProfilePicture,
        })),
        Replies: comment.Replies.map((reply) => ({
          CommentID: reply.CommentID,
          PostID: reply.PostID,
          ParentCommentID: reply.ParentCommentID,
          User: {
            ...reply.User,
            isFollowed: followingIds.has(reply.User.UserID),
          },
          Content: reply.Content,
          CreatedAt: reply.CreatedAt.toISOString(),
          isMine: reply.User.UserID === userId,
          likeCount: reply._count.CommentLikes,
          replyCount: reply._count.Replies,
          isLiked: reply.CommentLikes.some((like) => like.UserID === userId),
          likedBy: reply.CommentLikes.map((like) => ({
            username: like.User.Username,
            profilePicture: like.User.ProfilePicture,
          })),
        })),
      })),
      total: totalRemainingComments,
      totalTopLevel: totalTopLevelComments,
      page: parsedPage,
      limit: parsedLimit,
      hasMore: skip + parsedLimit < totalRemainingComments,
    };

    // Cache response for 5 minutes
    await redis.set(cacheKey, JSON.stringify(response), "EX", 300);
    logger.debug(`Cached response for key ${cacheKey}`);

    return res.json(response);
  } catch (err) {
    logger.error(
      `Error fetching comments for post ${parsedPostId}: ${err.message}`
    );
    return res.status(500).json({ error: "Failed to fetch comments" });
  }
};

/**
 * Fetches replies for a specific comment with pagination
 * - Replies sorted oldest first (CreatedAt ascending)
 * - Includes likes info, isLiked, and isFollowed flags
 */
const getCommentReplies = async (req, res) => {
  const { commentId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const parsedCommentId = parseInt(commentId);
  const userId = req.user.UserID;

  try {
    // Check if comment exists
    const parentComment = await prisma.comment.findUnique({
      where: { CommentID: parsedCommentId },
      select: { PostID: true },
    });
    if (!parentComment) return handleNotFoundError(res, "Comment not found");

    // Get following IDs
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = new Set(following.map((f) => f.UserID));

    const topReplies = await prisma.comment.findMany({
      where: { ParentCommentID: parsedCommentId },
      orderBy: { CreatedAt: "asc" },
      take: 3,
      select: { CommentID: true },
    });

    const excludeIds = topReplies.map((r) => r.CommentID);

    // Fetch replies with likes
    const replies = await prisma.comment.findMany({
      where: {
        ParentCommentID: parsedCommentId,
        CommentID: { notIn: excludeIds },
      },
      orderBy: { CreatedAt: "asc" }, // oldest first
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        User: {
          select: {
            UserID: true,
            Username: true,
            ProfileName: true,
            ProfilePicture: true,
          },
        },
        CommentLikes: {
          take: 3,
          orderBy: { CreatedAt: "asc" },
          include: {
            User: { select: { Username: true, ProfilePicture: true } },
          },
        },
        _count: { select: { CommentLikes: true, Replies: true } },
      },
    });

    const total = await prisma.comment.count({
      where: { ParentCommentID: parsedCommentId },
    });

    const response = {
      replies: replies.map((reply) => ({
        CommentID: reply.CommentID,
        PostID: reply.PostID,
        ParentCommentID: reply.ParentCommentID,
        User: {
          ...reply.User,
          isFollowed: followingIds.has(reply.User.UserID),
        },
        Content: reply.Content,
        CreatedAt: reply.CreatedAt.toISOString(),
        likeCount: reply._count.CommentLikes,
        replyCount: reply._count.Replies,
        isMine: reply.UserID === userId,
        isLiked: reply.CommentLikes.some((like) => like.UserID === userId),
        likedBy: reply.CommentLikes.map((like) => ({
          username: like.User.Username,
          profilePicture: like.User.ProfilePicture,
        })),
      })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    res.json(response);
  } catch (err) {
    logger.error(
      `Error fetching replies for comment ${commentId}: ${err.message}`
    );
    handleServerError(res, err, "Failed to fetch replies");
  }
};

module.exports = {
  createPost,
  getPosts,
  getExplorePosts,
  getFlicks,
  createBatchPostViews,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  addComment,
  editComment,
  deleteComment,
  likeComment,
  replyToComment,
  savePost,
  reportPost,
  sharePost,
  getPostLikers,
  getPostCommenters,
  getCommentReplies,
};
