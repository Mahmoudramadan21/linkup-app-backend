const prisma = require("../utils/prisma");
const {
  validateHighlightInput,
  validateHighlightUpdate,
} = require("../validators/highlightValidators");
const { validationResult } = require("express-validator");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

/**
 * Creates a new highlight after validating:
 * - User owns all stories being added
 * - Input meets validation requirements
 * - Uploads cover image to Cloudinary
 * - Returns response matching getUserHighlights format, including isMine, isViewed, isLiked, viewCount, likeCount, and latestViewers
 * - latestViewers: up to 6 viewers, prioritized by likers > followed users > recent, excluding self
 */
const createHighlight = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const userId = req.user?.UserID;
  if (!userId) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  // Validate request body
  if (!req.body) {
    return res.status(400).json({ error: "Request body is missing" });
  }

  let { title, storyIds } = req.body;

  // Handle storyIds as string (e.g., "1,2,3") or array
  if (typeof storyIds === "string") {
    try {
      storyIds = JSON.parse(storyIds);
    } catch (error) {
      storyIds = storyIds.split(",").map((id) => id.trim());
    }
  }

  let coverImageUrl;

  try {
    // Handle cover image upload
    const files = req.files || {};
    const coverImageFile = files.coverImage ? files.coverImage[0] : null;

    if (!coverImageFile) {
      return res.status(400).json({ error: "Cover image file is required" });
    }

    await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "linkup/highlights", resource_type: "image" },
        (error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          }
          coverImageUrl = result.secure_url;
          resolve();
        }
      );

      const bufferStream = new Readable();
      bufferStream.push(coverImageFile.buffer);
      bufferStream.push(null);
      bufferStream.pipe(uploadStream);
    });

    // Validate storyIds
    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      return res
        .status(400)
        .json({ error: "storyIds must be a non-empty array of integers" });
    }

    const parsedStoryIds = storyIds
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id));
    if (parsedStoryIds.length !== storyIds.length) {
      return res.status(400).json({ error: "Invalid story IDs provided" });
    }

    // Verify user owns all stories
    const validStories = await prisma.story.count({
      where: { StoryID: { in: parsedStoryIds }, UserID: userId },
    });

    if (validStories !== parsedStoryIds.length) {
      return res
        .status(403)
        .json({ error: "One or more stories are not owned by the user" });
    }

    // Fetch followings for viewer prioritization
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    // Create highlight with full data for response
    const highlight = await prisma.highlight.create({
      data: {
        Title: title,
        CoverImage: coverImageUrl,
        UserID: userId,
        StoryHighlights: {
          create: parsedStoryIds.map((id) => ({
            StoryID: id,
            AssignedAt: new Date(),
          })),
        },
      },
      include: {
        User: { select: { UserID: true } },
        StoryHighlights: {
          include: {
            Story: {
              include: {
                User: { select: { UserID: true } }, // For isMine check
                _count: {
                  select: { StoryLikes: true, StoryViews: true },
                },
                StoryViews: {
                  where: { UserID: { not: userId } },
                  orderBy: { ViewedAt: "desc" },
                  take: 20, // Optimized for 6 prioritized viewers
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
            },
          },
        },
      },
    });

    // Fetch story IDs for batch queries
    const storyIdsFromHighlight = highlight.StoryHighlights.map(
      (sh) => sh.Story.StoryID
    );

    // Views by current user
    const viewsByCurrentUser =
      storyIdsFromHighlight.length > 0
        ? await prisma.storyView.findMany({
            where: { StoryID: { in: storyIdsFromHighlight }, UserID: userId },
            select: { StoryID: true },
          })
        : [];
    const viewedSet = new Set(viewsByCurrentUser.map((v) => v.StoryID));

    // Likes for prioritization
    const viewerLikes =
      storyIdsFromHighlight.length > 0
        ? await prisma.storyLike.findMany({
            where: { StoryID: { in: storyIdsFromHighlight } },
            select: { StoryID: true, UserID: true },
          })
        : [];
    const likedUserIdsByStory = viewerLikes.reduce((acc, like) => {
      const sid = like.StoryID;
      if (!acc[sid]) acc[sid] = new Set();
      acc[sid].add(like.UserID);
      return acc;
    }, {});

    // Prioritize viewers (consistent with getUserHighlights)
    const prioritizeViewers = (viewers, followingIds, storyId) => {
      return (viewers || [])
        .filter((v) => v.User && v.User.UserID !== userId)
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

    // Map response to match getUserHighlights
    const response = {
      highlightId: highlight.HighlightID,
      title: highlight.Title,
      coverImage: highlight.CoverImage,
      storyCount: highlight.StoryHighlights.length,
      isMine: highlight.User.UserID === userId,
      stories: highlight.StoryHighlights.map((sh) => {
        const story = sh.Story;
        const isMine = story.User.UserID === userId; // Always true since only owner can create
        const isViewed = viewedSet.has(story.StoryID);
        const totalViews = story._count.StoryViews;
        const totalLikes = story._count.StoryLikes;

        const adjustedViewCount =
          isMine && isViewed ? totalViews - 1 : totalViews;
        const adjustedLikeCount = totalLikes;

        const latestViewers = prioritizeViewers(
          story.StoryViews,
          followingIds,
          story.StoryID
        );

        return {
          storyId: story.StoryID,
          mediaUrl: story.MediaURL,
          createdAt: story.CreatedAt,
          expiresAt: story.ExpiresAt,
          assignedAt: sh.AssignedAt,
          isMine,
          isViewed,
          viewCount: isMine ? adjustedViewCount : undefined,
          likeCount: isMine ? adjustedLikeCount : undefined,
          latestViewers, // Included since isMine is always true for creation
        };
      }),
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("Create highlight error:", error);
    res.status(500).json({
      error: "Highlight creation failed",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

/**
 * Gets highlights with privacy considerations:
 * - Full access for owner
 * - Restricted based on account privacy and follow status
 * - Returns highlights with associated stories
 * - For each story: includes isMine, isViewed, isLiked, viewCount, likeCount (adjusted for own stories), and latestViewers (only for own stories)
 * - latestViewers: up to 6 viewers, prioritized by likers > followed users > recent, excluding self (only for isMine: true)
 * - Supports pagination for highlights via query params (limit, offset)
 * - Uses username (case-insensitive) instead of userId
 */
const getUserHighlights = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user?.UserID;
    if (!currentUserId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Validate username
    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length === 0
    ) {
      return res.status(400).json({ error: "Invalid username format" });
    }

    // Parse pagination parameters
    const { limit = 20, offset = 0 } = req.query;
    const parsedLimit = Math.max(1, parseInt(limit, 10));
    const parsedOffset = Math.max(0, parseInt(offset, 10));
    const page = Math.floor(parsedOffset / parsedLimit) + 1;

    // Fetch user by username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: { Username: { equals: username, mode: "insensitive" } },
      select: {
        UserID: true,
        IsPrivate: true,
        Username: true,
        Followers: {
          where: { FollowerUserID: currentUserId, Status: "ACCEPTED" },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user.UserID;
    const isOwner = userId === currentUserId;

    // Check access for private accounts
    if (user.IsPrivate && !isOwner && user.Followers.length === 0) {
      return res.status(200).json({
        message: `@${user.Username} has a private account. You must follow them to view their highlights.`,
        isPrivate: true,
        highlights: [],
        totalCount: 0,
        page,
        limit: parsedLimit,
        totalPages: 0,
      });
    }

    // Fetch followings for viewer prioritization
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: currentUserId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    // Count total highlights
    const totalCount = await prisma.highlight.count({
      where: { UserID: userId },
    });

    // Fetch highlights with stories
    const highlights = await prisma.highlight.findMany({
      where: { UserID: userId },
      skip: parsedOffset,
      take: parsedLimit,
      orderBy: { CreatedAt: "desc" },
      include: {
        StoryHighlights: {
          include: {
            Story: {
              include: {
                User: { select: { UserID: true } },
                StoryLikes: {
                  where: { UserID: currentUserId },
                  select: { LikeID: true },
                },
                _count: { select: { StoryLikes: true, StoryViews: true } },
                StoryViews: isOwner
                  ? {
                      where: { UserID: { not: currentUserId } },
                      orderBy: { ViewedAt: "desc" },
                      take: 20,
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
                    }
                  : undefined,
              },
            },
          },
        },
      },
    });

    if (!highlights || highlights.length === 0) {
      return res.json({
        highlights: [],
        totalCount,
        page,
        limit: parsedLimit,
        totalPages: Math.ceil(totalCount / parsedLimit),
      });
    }

    // Fetch all story IDs for batch queries
    const allStoryHighlights = highlights.flatMap((h) => h.StoryHighlights);
    const storyIds = allStoryHighlights.map((sh) => sh.Story.StoryID);

    // Views by current user (batch)
    const viewsByCurrentUser = await prisma.storyView.findMany({
      where: { StoryID: { in: storyIds }, UserID: currentUserId },
      select: { StoryID: true },
    });
    const viewedSet = new Set(viewsByCurrentUser.map((v) => v.StoryID));

    // Likes for prioritization (batch, only for owner)
    const viewerLikes =
      isOwner && storyIds.length > 0
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

    // Prioritize viewers (likers > followed > recent)
    const prioritizeViewers = (viewers, followingIds, storyId) => {
      return (viewers || [])
        .filter((v) => v.User && v.User.UserID !== currentUserId)
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

    // Map response highlights
    const highlightsMapped = highlights.map((highlight) => {
      const isMine = highlight.UserID === currentUserId; 

      return {
        highlightId: highlight.HighlightID,
        title: highlight.Title,
        coverImage: highlight.CoverImage,
        storyCount: highlight.StoryHighlights.length,
        isMine,
        stories: highlight.StoryHighlights.map((sh) => {
          const story = sh.Story;
          const isMineStory = story.User.UserID === currentUserId;
          const isViewed = viewedSet.has(story.StoryID);
          const isLiked = story.StoryLikes.length > 0;
          const totalViews = story._count.StoryViews;
          const totalLikes = story._count.StoryLikes;

          const adjustedViewCount =
            isMineStory && isViewed ? totalViews - 1 : totalViews;
          const adjustedLikeCount =
            isMineStory && isLiked ? totalLikes - 1 : totalLikes;

          const latestViewers = isMineStory
            ? prioritizeViewers(story.StoryViews, followingIds, story.StoryID)
            : undefined;

          return {
            storyId: story.StoryID,
            mediaUrl: story.MediaURL,
            createdAt: story.CreatedAt,
            expiresAt: story.ExpiresAt,
            assignedAt: sh.AssignedAt,
            isMine: isMineStory,
            isViewed,
            viewCount: isMineStory ? adjustedViewCount : undefined,
            likeCount: isMineStory ? adjustedLikeCount : undefined,
            latestViewers,
          };
        }),
      };
    });


    // Final response with pagination
    res.json({
      highlights: highlightsMapped,
      totalCount,
      page,
      limit: parsedLimit,
      totalPages: Math.ceil(totalCount / parsedLimit),
    });
  } catch (error) {
    console.error("Error in getUserHighlights:", error);
    res.status(500).json({
      error: "Failed to fetch highlights",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

/**
 * Updates a highlight with partial update support
 * Features:
 * - Validates user ownership
 * - Checks story ownership when updating stories
 * - Supports cover image upload
 * - Returns response consistent with getUserHighlights
 * - Includes isMine, isViewed, isLiked, counts, and latestViewers
 */
const updateHighlight = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, storyIds: bodyStoryIds } = req.body;
  const { highlightId } = req.params;
  const userId = req.user?.UserID;

  if (!userId) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    // Verify highlight ownership
    const existingHighlight = await prisma.highlight.findUnique({
      where: { HighlightID: parseInt(highlightId, 10) },
      select: { UserID: true },
    });

    if (!existingHighlight || existingHighlight.UserID !== userId) {
      return res
        .status(404)
        .json({ error: "Highlight not found or not owned" });
    }

    // Prepare update data
    const updateData = {};

    if (typeof title !== "undefined") {
      updateData.Title = title;
    }

    // Handle cover image upload
    const files = req.files || {};
    const coverImageFile = files.coverImage ? files.coverImage[0] : null;

    if (coverImageFile) {
      const coverImageUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "linkup/highlights", resource_type: "image" },
          (error, result) => {
            if (error) {
              console.error("Cloudinary upload error:", error);
              reject(new Error(`Cloudinary upload failed: ${error.message}`));
            }
            resolve(result.secure_url);
          }
        );

        const bufferStream = new Readable();
        bufferStream.push(coverImageFile.buffer);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
      });

      updateData.CoverImage = coverImageUrl;
    }

    // Handle story updates with ownership validation
    if (typeof bodyStoryIds !== "undefined") {
      if (!Array.isArray(bodyStoryIds) || bodyStoryIds.length === 0) {
        return res
          .status(400)
          .json({ error: "Must include at least one valid story ID" });
      }

      const parsedStoryIds = bodyStoryIds
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      if (parsedStoryIds.length !== bodyStoryIds.length) {
        return res.status(400).json({ error: "Invalid story IDs provided" });
      }

      // Ensure all stories belong to the current user
      const validCount = await prisma.story.count({
        where: { StoryID: { in: parsedStoryIds }, UserID: userId },
      });

      if (validCount !== parsedStoryIds.length) {
        return res
          .status(403)
          .json({ error: "One or more stories are not owned by the user" });
      }

      // Reset story highlights
      updateData.StoryHighlights = {
        deleteMany: { HighlightID: parseInt(highlightId, 10) },
        create: parsedStoryIds.map((id) => ({
          StoryID: id,
          AssignedAt: new Date(),
        })),
      };
    }

    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ error: "No valid fields provided for update" });
    }

    // Fetch followings for viewer prioritization
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    // Update highlight and include all needed relations
    const updatedHighlight = await prisma.highlight.update({
      where: { HighlightID: parseInt(highlightId, 10) },
      data: updateData,
      include: {
        User: { select: { UserID: true } },
        StoryHighlights: {
          include: {
            Story: {
              include: {
                User: { select: { UserID: true } },
                StoryLikes: {
                  where: { UserID: userId },
                  select: { LikeID: true },
                },
                _count: { select: { StoryLikes: true, StoryViews: true } },
                StoryViews: {
                  where: { UserID: { not: userId } },
                  orderBy: { ViewedAt: "desc" },
                  take: 20,
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
            },
          },
        },
      },
    });

    const updatedStoryIds = updatedHighlight.StoryHighlights.map(
      (sh) => sh.Story.StoryID
    );

    // Views by current user
    const viewsByCurrentUser =
      updatedStoryIds.length > 0
        ? await prisma.storyView.findMany({
            where: { StoryID: { in: updatedStoryIds }, UserID: userId },
            select: { StoryID: true },
          })
        : [];
    const viewedSet = new Set(viewsByCurrentUser.map((v) => v.StoryID));

    // Likes for prioritization
    const viewerLikes =
      updatedStoryIds.length > 0
        ? await prisma.storyLike.findMany({
            where: { StoryID: { in: updatedStoryIds } },
            select: { StoryID: true, UserID: true },
          })
        : [];

    const likedUserIdsByStory = viewerLikes.reduce((acc, like) => {
      if (!acc[like.StoryID]) acc[like.StoryID] = new Set();
      acc[like.StoryID].add(like.UserID);
      return acc;
    }, {});

    // Viewer prioritization
    const prioritizeViewers = (viewers, storyId) => {
      return (viewers || [])
        .filter((v) => v.User && v.User.UserID !== userId)
        .sort((a, b) => {
          const aId = a.User.UserID;
          const bId = b.User.UserID;

          const aLiked = likedUserIdsByStory[storyId]?.has(aId) ?? false;
          const bLiked = likedUserIdsByStory[storyId]?.has(bId) ?? false;
          if (aLiked !== bLiked) return bLiked - aLiked;

          const aFollowed = followingIds.includes(aId);
          const bFollowed = followingIds.includes(bId);
          if (aFollowed !== bFollowed) return bFollowed - aFollowed;

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
          isLiked: likedUserIdsByStory[storyId]?.has(v.User.UserID) ?? false,
        }));
    };

    // Map final response
    const response = {
      highlightId: updatedHighlight.HighlightID,
      title: updatedHighlight.Title,
      coverImage: updatedHighlight.CoverImage,
      storyCount: updatedHighlight.StoryHighlights.length,
      isMine: updatedHighlight.User.UserID === userId,
      stories: updatedHighlight.StoryHighlights.map((sh) => {
        const story = sh.Story;
        const isMine = story.User.UserID === userId;
        const isViewed = viewedSet.has(story.StoryID);
        const isLiked = story.StoryLikes.length > 0;

        const totalViews = story._count.StoryViews;
        const totalLikes = story._count.StoryLikes;

        return {
          storyId: story.StoryID,
          mediaUrl: story.MediaURL,
          createdAt: story.CreatedAt,
          expiresAt: story.ExpiresAt,
          assignedAt: sh.AssignedAt,
          isMine,
          isViewed,
          isLiked,
          viewCount: isMine ? totalViews - (isViewed ? 1 : 0) : undefined,
          likeCount: isMine ? totalLikes - (isLiked ? 1 : 0) : undefined,
          latestViewers: prioritizeViewers(story.StoryViews, story.StoryID),
        };
      }),
    };

    return res.json(response);
  } catch (error) {
    console.error("Update highlight error:", error);
    return res.status(500).json({
      error: "Failed to update highlight",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};


/**
 * Deletes highlight safely using transaction:
 * 1. Removes all story associations
 * 2. Deletes the highlight record
 */
const deleteHighlight = async (req, res) => {
  try {
    const highlightId = parseInt(req.params.highlightId);
    const userId = req.user.UserID;

    // Ownership verification
    const highlight = await prisma.highlight.findFirst({
      where: { HighlightID: highlightId, UserID: userId },
    });

    if (!highlight) {
      const exists = await prisma.highlight.count({
        where: { HighlightID: highlightId },
      });
      return res.status(exists ? 403 : 404).json({
        error: exists ? "You don't own this highlight" : "Highlight not found",
      });
    }

    // Atomic delete operation
    await prisma.$transaction([
      prisma.storyHighlight.deleteMany({ where: { HighlightID: highlightId } }),
      prisma.highlight.delete({ where: { HighlightID: highlightId } }),
    ]);

    res.json({
      success: true,
      message: "Highlight deleted successfully",
      deletedId: highlightId,
    });
  } catch (error) {
    console.error("Delete highlight error:", error);
    res.status(500).json({
      error: "Deletion failed",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

/**
 * Gets a specific highlight by ID with privacy considerations:
 * - Full access for owner
 * - Restricted based on account privacy and follow status
 * - Returns highlight with associated stories, including isMine, isViewed, isLiked, viewCount, likeCount, and latestViewers (for own stories)
 * - latestViewers: up to 6 viewers, prioritized by likers > followed users > recent, excluding self
 */
const getUserHighlightById = async (req, res) => {
  try {
    const { highlightId } = req.params;
    const currentUserId = req.user?.UserID;

    if (!currentUserId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Validate highlightId
    const parsedHighlightId = parseInt(highlightId);
    if (isNaN(parsedHighlightId)) {
      return res.status(400).json({ error: "Invalid highlight ID" });
    }

    // Fetch highlight with user data for privacy check
    const highlight = await prisma.highlight.findUnique({
      where: { HighlightID: parsedHighlightId },
      include: {
        User: {
          select: {
            UserID: true,
            Username: true,
            IsPrivate: true,
            Followers: {
              where: { FollowerUserID: currentUserId, Status: "ACCEPTED" },
            },
          },
        },
        StoryHighlights: {
          include: {
            Story: {
              include: {
                User: { select: { UserID: true } },
                StoryLikes: {
                  where: { UserID: currentUserId },
                  select: { LikeID: true },
                },
                _count: { select: { StoryLikes: true, StoryViews: true } },
                StoryViews: {
                  where: { UserID: { not: currentUserId } },
                  orderBy: { ViewedAt: "desc" },
                  take: 20, // Optimized for 6 prioritized viewers
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
            },
          },
        },
      },
    });

    if (!highlight) {
      return res.status(404).json({ error: "Highlight not found" });
    }

    const isOwner = highlight.User.UserID === currentUserId;

    // Check access for private accounts
    if (highlight.User.IsPrivate && !isOwner && highlight.User.Followers.length === 0) {
      return res.status(403).json({
        error: "Private account",
        message: `You must follow @${highlight.User.Username} to view their highlights`,
      });
    }

    // Fetch followings for viewer prioritization
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: currentUserId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    // Fetch story IDs for batch queries
    const storyIds = highlight.StoryHighlights.map((sh) => sh.Story.StoryID);

    // Views by current user (batch)
    const viewsByCurrentUser =
      storyIds.length > 0
        ? await prisma.storyView.findMany({
            where: { StoryID: { in: storyIds }, UserID: currentUserId },
            select: { StoryID: true },
          })
        : [];
    const viewedSet = new Set(viewsByCurrentUser.map((v) => v.StoryID));

    // Likes for prioritization (batch, only for owner)
    const viewerLikes =
      isOwner && storyIds.length > 0
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

    // Prioritize viewers (likers > followed > recent)
    const prioritizeViewers = (viewers, followingIds, storyId) => {
      return (viewers || [])
        .filter((v) => v.User && v.User.UserID !== currentUserId)
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

    // Map response to match getUserHighlights
    const response = {
      highlightId: highlight.HighlightID,
      title: highlight.Title,
      coverImage: highlight.CoverImage,
      storyCount: highlight.StoryHighlights.length,
      isMine: isOwner,
      stories: highlight.StoryHighlights.map((sh) => {
        const story = sh.Story;
        const isMine = story.User.UserID === currentUserId;
        const isViewed = viewedSet.has(story.StoryID);
        const isLiked = story.StoryLikes.length > 0;
        const totalViews = story._count.StoryViews;
        const totalLikes = story._count.StoryLikes;

        const adjustedViewCount =
          isMine && isViewed ? totalViews - 1 : totalViews;
        const adjustedLikeCount =
          isMine && isLiked ? totalLikes - 1 : totalLikes;

        const latestViewers = isMine
          ? prioritizeViewers(story.StoryViews, followingIds, story.StoryID)
          : undefined;

        return {
          storyId: story.StoryID,
          mediaUrl: story.MediaURL,
          createdAt: story.CreatedAt,
          expiresAt: story.ExpiresAt,
          assignedAt: sh.AssignedAt,
          isMine,
          isViewed,
          viewCount: isMine ? adjustedViewCount : undefined,
          likeCount: isMine ? adjustedLikeCount : undefined,
          latestViewers,
        };
      }),
    };

    res.json(response);
  } catch (error) {
    console.error("Error in getUserHighlightById:", error);
    res.status(500).json({
      error: "Failed to fetch highlight",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

// Export the new function
module.exports = {
  createHighlight,
  getUserHighlights,
  updateHighlight,
  deleteHighlight,
  getUserHighlightById, 
};