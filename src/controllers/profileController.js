const NotificationService = require("../services/notificationService");
const logger = require("../utils/logger");
const prisma = require("../utils/prisma");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const {
  handleServerError,
  handleNotFoundError,
  handleForbiddenError,
} = require("../utils/errorHandler");
const cloudinary = require("cloudinary").v2;

// Salt rounds for password hashing - recommended value
const SALT_ROUNDS = 10;

/**
 * Fisher-Yates Shuffle algorithm to randomize an array in place
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Retrieves user profile by username with privacy checks
 * Returns profile if account is public or if private and followed by current user
 */
const getProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user?.UserID;

    if (!currentUserId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { Username: username },
      select: {
        UserID: true,
        Username: true,
        ProfilePicture: true,
        CoverPicture: true,
        Bio: true,
        Address: true,
        JobTitle: true,
        DateOfBirth: true,
        IsPrivate: true,
        Role: true,
        CreatedAt: true,
        UpdatedAt: true,
        ProfileName: true,
        IsBanned: true,
        _count: {
          select: {
            Posts: true,
            Followers: { where: { Status: "ACCEPTED" } },
            Following: { where: { Status: "ACCEPTED" } },
            Likes: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.IsBanned) {
      return res.status(403).json({ error: "User is banned" });
    }

    // Check if the current user is following this user and get follow status
    let isFollowed = false;
    let followStatus = "NONE";
    if (currentUserId !== user.UserID) {
      const followStatusQuery = await prisma.follower.findFirst({
        where: {
          UserID: user.UserID,
          FollowerUserID: currentUserId,
        },
      });
      if (followStatusQuery) {
        isFollowed = followStatusQuery.Status === "ACCEPTED";
        followStatus = followStatusQuery.Status;
      }
    }

    // Check if user has unviewed stories
    let hasUnViewedStories = false;
    if (currentUserId) {
      const unviewedStory = await prisma.story.findFirst({
        where: {
          UserID: user.UserID,
          ExpiresAt: { gt: new Date() },
          StoryViews: {
            none: { UserID: currentUserId }, // Current user hasn’t viewed
          },
        },
        select: { StoryID: true },
      });
      hasUnViewedStories = !!unviewedStory;
    }

    // Check if user has active stories (not expired)
    const hasActiveStories = !!(await prisma.story.findFirst({
      where: {
        UserID: user.UserID,
        ExpiresAt: { gt: new Date() },
      },
      select: { StoryID: true },
    }));

    // Check if current user has access to this account
    const hasAccess =
      !user.IsPrivate || // Public account
      user.UserID === currentUserId || // Own account
      isFollowed; // Private but followed

    // Fetch mutual followers (users who follow the target user and are followed by the current user)
    let followedBy = [];
    if (currentUserId !== user.UserID) {
      // Get users followed by the current user
      const currentUserFollowing = await prisma.follower.findMany({
        where: {
          FollowerUserID: currentUserId,
          Status: "ACCEPTED",
        },
        select: { UserID: true },
      });
      const followingIds = currentUserFollowing.map((f) => f.UserID);

      if (followingIds.length > 0) {
        // Get users who follow the target user and are in the current user's following list
        const mutualFollowers = await prisma.follower.findMany({
          where: {
            UserID: user.UserID,
            FollowerUserID: { in: followingIds },
            Status: "ACCEPTED",
          },
          select: {
            FollowerUser: {
              select: {
                UserID: true,
                Username: true,
                ProfileName: true,
                ProfilePicture: true,
              },
            },
            FollowerUser: {
              include: {
                Likes: {
                  where: { Post: { UserID: user.UserID } },
                  select: { CreatedAt: true },
                  orderBy: { CreatedAt: "desc" },
                  take: 1,
                },
                Comments: {
                  where: { Post: { UserID: user.UserID } },
                  select: { CreatedAt: true },
                  orderBy: { CreatedAt: "desc" },
                  take: 1,
                },
                StoryViews: {
                  where: { Story: { UserID: user.UserID } },
                  select: { ViewedAt: true },
                  orderBy: { ViewedAt: "desc" },
                  take: 1,
                },
              },
            },
          },
          take: 10, // Fetch more to prioritize, then slice to 3
        });

        // Prioritize by most recent interaction (likes, comments, story views)
        followedBy = mutualFollowers
          .map((follower) => {
            const { FollowerUser } = follower;
            const latestLike = FollowerUser.Likes[0]?.CreatedAt;
            const latestComment = FollowerUser.Comments[0]?.CreatedAt;
            const latestStoryView = FollowerUser.StoryViews[0]?.ViewedAt;

            // Determine the most recent interaction time
            const latestInteraction = [
              latestLike,
              latestComment,
              latestStoryView,
            ]
              .filter((date) => date)
              .reduce((latest, current) => {
                return !latest || new Date(current) > new Date(latest)
                  ? current
                  : latest;
              }, null);

            return {
              userId: FollowerUser.UserID,
              username: FollowerUser.Username,
              profileName: FollowerUser.ProfileName,
              profilePicture: FollowerUser.ProfilePicture,
              isFollowed: true, // Always true since they are in currentUserFollowing
              latestInteraction: latestInteraction
                ? new Date(latestInteraction).toISOString()
                : null,
            };
          })
          .sort((a, b) => {
            if (!a.latestInteraction) return 1;
            if (!b.latestInteraction) return -1;
            return (
              new Date(b.latestInteraction) - new Date(a.latestInteraction)
            );
          })
          .slice(0, 3); // Take top 3
      }
    }

    let conversationId = null;

    if (currentUserId !== user.UserID) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          Participants: {
            some: { UserID: currentUserId },
          },
          AND: [
            {
              Participants: {
                some: { UserID: user.UserID },
              },
            },
          ],
        },
        select: {
          Id: true,
        },
      });

      conversationId = conversation?.Id || null;
    }

    const response = {
      profile: {
        userId: user.UserID,
        username: user.Username,
        profilePicture: user.ProfilePicture,
        coverPicture: user.CoverPicture,
        bio: user.Bio,
        address: user.Address,
        jobTitle: user.JobTitle,
        dateOfBirth: user.DateOfBirth,
        isPrivate: user.IsPrivate,
        role: user.Role,
        createdAt: user.CreatedAt,
        updatedAt: user.UpdatedAt,
        postCount: user._count.Posts,
        followerCount: user._count.Followers,
        followingCount: user._count.Following,
        likeCount: user._count.Likes,
        isFollowed,
        profileName: user.ProfileName,
        followStatus,
        hasUnViewedStories,
        hasActiveStories,
        hasAccess,
        isMine: user.UserID === currentUserId,
        followedBy,
        conversationId,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("getProfileByUsername error:", error);
    res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Retrieves user profile with counts and additional details
 * Returns 404 if user not found
 */
const getProfile = async (req, res) => {
  const userId = req.user.UserID;

  try {
    const user = await prisma.user.findUnique({
      where: { UserID: userId },
      select: {
        UserID: true,
        Username: true,
        Email: true,
        ProfilePicture: true,
        CoverPicture: true,
        Bio: true,
        Address: true,
        JobTitle: true,
        DateOfBirth: true,
        IsPrivate: true,
        Role: true,
        CreatedAt: true,
        UpdatedAt: true,
        ProfileName: true,
        _count: {
          select: {
            Posts: true,
            Likes: true,
            Followers: { where: { Status: "ACCEPTED" } },
            Following: { where: { Status: "ACCEPTED" } },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Format response with counts
    const response = {
      userId: user.UserID,
      username: user.Username,
      email: user.Email,
      profilePicture: user.ProfilePicture,
      coverPicture: user.CoverPicture,
      bio: user.Bio,
      address: user.Address,
      jobTitle: user.JobTitle,
      dateOfBirth: user.DateOfBirth,
      isPrivate: user.IsPrivate,
      role: user.Role,
      createdAt: user.CreatedAt,
      updatedAt: user.UpdatedAt,
      postCount: user._count.Posts,
      followerCount: user._count.Followers,
      followingCount: user._count.Following,
      likeCount: user._count.Likes,
      profileName: user.ProfileName,
    };

    res.status(200).json({ profile: response });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching profile", error: error.message });
  }
};

/**
 * Normalizes email for uniqueness check while preserving the original email
 * Removes dots from the local part for Gmail addresses
 * @param {string} email - The email to normalize
 * @returns {string} - Normalized email for uniqueness check
 */
const normalizeEmailForCheck = (email) => {
  const [localPart, domain] = email.split("@");
  if (domain.toLowerCase().includes("gmail.com")) {
    return `${localPart.replace(/\./g, "")}@${domain.toLowerCase()}`;
  }
  return email.toLowerCase();
};

/**
 * Updates user profile with validation for duplicates and new fields
 * Supports profile and cover picture uploads
 * Returns updated profile data
 */
const updateProfile = async (req, res) => {
  const {
    username,
    email: originalEmail, // Renamed to distinguish from normalized email
    bio,
    address,
    jobTitle,
    dateOfBirth,
    isPrivate,
    firstName,
    lastName,
  } = req.body;
  const userId = req.user.UserID;
  let profilePictureUrl, coverPictureUrl;

  // Handle multiple file uploads (profilePicture and coverPicture)
  const files = req.files || {};
  const profilePictureFile = files.profilePicture
    ? files.profilePicture[0]
    : null;
  const coverPictureFile = files.coverPicture ? files.coverPicture[0] : null;

  try {
    // Fetch current user data to get the old username
    const currentUser = await prisma.user.findUnique({
      where: { UserID: userId },
      select: { Username: true, IsPrivate: true },
    });

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const wasPrivate = currentUser.IsPrivate;

    // Upload profile picture if provided
    if (profilePictureFile) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "profile_pictures",
            public_id: `user_${userId}_profile`,
            overwrite: true,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(profilePictureFile.buffer);
      });
      profilePictureUrl = uploadResult.secure_url;
    }

    // Upload cover picture if provided
    if (coverPictureFile) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "cover_pictures",
            public_id: `user_${userId}_cover`,
            overwrite: true,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(coverPictureFile.buffer);
      });
      coverPictureUrl = uploadResult.secure_url;
    }

    // Validate username uniqueness if provided
    if (username) {
      const existingUsername = await prisma.user.findFirst({
        where: {
          Username: username,
          UserID: { not: userId },
        },
      });
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }
    }

    // Validate email uniqueness if provided
    if (originalEmail) {
      // Normalize email only for uniqueness check
      const normalizedEmail = normalizeEmailForCheck(originalEmail);
      const existingEmail = await prisma.user.findFirst({
        where: {
          Email: {
            in: [normalizedEmail, originalEmail], // Check both normalized and original to cover all cases
          },
          UserID: { not: userId },
        },
      });
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    // Validate dateOfBirth if provided
    if (dateOfBirth) {
      const parsedDate = new Date(dateOfBirth);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid date of birth" });
      }
    }

    // Parse incoming isPrivate value
    let parsedIsPrivate;
    if (typeof isPrivate !== "undefined") {
      if (isPrivate === "true" || isPrivate === true) parsedIsPrivate = true;
      else if (isPrivate === "false" || isPrivate === false)
        parsedIsPrivate = false;
      else
        return res.status(400).json({
          message: "isPrivate must be true or false",
        });
    }

    // Detect privacy change (private -> public)
    const becomingPublic = wasPrivate === true && parsedIsPrivate === false;

    // Generate profileName from firstName and lastName if provided
    let profileName;
    if (firstName || lastName) {
      profileName = `${firstName || ""} ${lastName || ""}`.trim();
      if (profileName === "") {
        return res.status(400).json({
          message:
            "First name or last name must be provided to generate profileName",
        });
      }
    }

    // Update the user's profile, preserving the original email
    const updatedUser = await prisma.user.update({
      where: { UserID: userId },
      data: {
        Username: username,
        Email: originalEmail, // Save the original email as provided
        Bio: bio,
        Address: address,
        JobTitle: jobTitle,
        DateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        ProfilePicture: profilePictureUrl,
        CoverPicture: coverPictureUrl,
        IsPrivate: parsedIsPrivate,
        ProfileName: profileName,
      },
      select: {
        UserID: true,
        Username: true,
        Email: true,
        ProfilePicture: true,
        CoverPicture: true,
        Bio: true,
        Address: true,
        JobTitle: true,
        DateOfBirth: true,
        IsPrivate: true,
        Role: true,
        CreatedAt: true,
        UpdatedAt: true,
        ProfileName: true,
      },
    });

    if (becomingPublic) {
      await prisma.post.updateMany({
        where: { UserID: userId },
        data: { privacy: "PUBLIC" },
      });

      const pendingFollowers = await prisma.follower.findMany({
        where: { UserID: userId, Status: "PENDING" },
        select: { FollowerUserID: true },
      });

      if (pendingFollowers.length > 0) {
        await prisma.follower.updateMany({
          where: { UserID: userId, Status: "PENDING" },
          data: { Status: "ACCEPTED" },
        });

        const oldFollowRequestIds = await prisma.notification
          .findMany({
            where: {
              UserID: userId,
              Type: "FOLLOW_REQUEST",
              SenderID: { in: pendingFollowers.map((f) => f.FollowerUserID) },
            },
            select: { NotificationID: true },
          })
          .then((n) => n.map((notif) => notif.NotificationID));

        const deletedNotificationIds =
          await NotificationService.deleteNotificationsAndEmit(
            userId,
            oldFollowRequestIds
          );

        await NotificationService.deleteOldFollowRequests(userId);

        await Promise.all(
          pendingFollowers.forEach((f) => {
            if (f.FollowerUserID === userId) return;
            NotificationService.createNotification({
              userId: f.FollowerUserID,
              senderId: userId,
              type: "FOLLOW_ACCEPTED",
              content: `@${updatedUser.Username} is now public! Your follow request was automatically approved`,
              metadata: {
                followedUserId: userId,
                username: updatedUser.Username,
                autoApproved: true,
              },
            });
          })
        );
      }
    }

    // Detect privacy change (public -> private)
    const becomingPrivate = wasPrivate === false && parsedIsPrivate === true;

    if (becomingPrivate) {
      await prisma.post.updateMany({
        where: { UserID: userId },
        data: { privacy: "FOLLOWERS_ONLY" },
      });
    }

    // Respond with the updated profile
    res.status(200).json({
      message: "Profile updated successfully",
      profile: {
        userId: updatedUser.UserID,
        username: updatedUser.Username,
        email: updatedUser.Email,
        profilePicture: updatedUser.ProfilePicture,
        coverPicture: updatedUser.CoverPicture,
        bio: updatedUser.Bio,
        address: updatedUser.Address,
        jobTitle: updatedUser.JobTitle,
        dateOfBirth: updatedUser.DateOfBirth,
        isPrivate: updatedUser.IsPrivate,
        role: updatedUser.Role,
        createdAt: updatedUser.CreatedAt,
        updatedAt: updatedUser.UpdatedAt,
        profileName: updatedUser.ProfileName,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating profile", error: error.message });
  }
};

/**
 * Changes user password after verifying old password
 * Uses bcrypt for secure password hashing
 */
const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.UserID;

  try {
    const user = await prisma.user.findUnique({ where: { UserID: userId } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify old password matches stored hash
    const isPasswordValid = await bcrypt.compare(oldPassword, user.Password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    // Hash new password with current salt rounds
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { UserID: userId },
      data: {
        Password: hashedPassword,
      },
    });

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error changing password", error: error.message });
  }
};

/**
 * Updates user privacy setting (public/private account)
 * - Updates all posts privacy
 * - Auto-accepts pending follow requests when going public
 * - Sends real-time FOLLOW_ACCEPTED notifications via NotificationService
 * - Emits real-time events correctly
 */
const updatePrivacySettings = async (req, res) => {
  const { isPrivate } = req.body;
  const userId = req.user.UserID;
  const username = req.user.Username;
  const io = req.app.get("io");

  try {
    const isPrivateBoolean = isPrivate === true || isPrivate === "true";

    const currentUser = await prisma.user.findUnique({
      where: { UserID: userId },
      select: { IsPrivate: true, Username: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (currentUser.IsPrivate === isPrivateBoolean) {
      return res.status(200).json({
        message: "No changes detected",
        profile: { ...req.user, IsPrivate: isPrivateBoolean },
      });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { UserID: userId },
        data: { IsPrivate: isPrivateBoolean },
      });

      await prisma.post.updateMany({
        where: { UserID: userId },
        data: { privacy: isPrivateBoolean ? "FOLLOWERS_ONLY" : "PUBLIC" },
      });

      if (currentUser.IsPrivate && !isPrivateBoolean) {
        const pendingFollowers = await tx.follower.findMany({
          where: { UserID: userId, Status: "PENDING" },
          select: { FollowerUserID: true },
        });

        if (pendingFollowers.length > 0) {
          await tx.follower.updateMany({
            where: { UserID: userId, Status: "PENDING" },
            data: { Status: "ACCEPTED", UpdatedAt: new Date() },
          });

          await Promise.all(
            pendingFollowers.map((f) =>
              NotificationService.createNotification({
                userId: f.FollowerUserID,
                senderId: userId,
                type: "FOLLOW_ACCEPTED",
                content: `@${username} is now public! Your follow request was automatically approved`,
                metadata: {
                  followedUserId: userId,
                  username,
                  autoApproved: true,
                },
              })
            )
          );
        }
      }

      return await tx.user.findUnique({
        where: { UserID: userId },
        select: {
          UserID: true,
          Username: true,
          ProfileName: true,
          ProfilePicture: true,
          Bio: true,
          IsPrivate: true,
          Role: true,
          CreatedAt: true,
          UpdatedAt: true,
        },
      });
    });

    res.status(200).json({
      success: true,
      message: "Privacy settings updated successfully",
      profile: updatedUser,
    });
  } catch (error) {
    logger.error(
      `updatePrivacySettings error for user ${userId}: ${error.message}`
    );
    res.status(500).json({
      error: "Failed to update privacy settings",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Permanently deletes user account and all associated data
 * Requires authentication
 */
const deleteProfile = async (req, res) => {
  const userId = req.user.UserID;

  try {
    await prisma.user.delete({
      where: { UserID: userId },
    });

    res.status(200).json({ message: "Profile deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting profile", error: error.message });
  }
};

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
 * Retrieves all posts by a specific user with privacy checks
 * - Includes pagination and post view tracking
 * - Mirrors getPosts structure with batch queries, parallel execution, and in-memory grouping
 * - Prioritizes unseen posts, sorted strictly by creation date (newest to oldest)
 * - Maintains same likes/comments/replies ordering as getPosts
 * - Handles shared posts and privacy checks
 */
const getUserPosts = async (req, res) => {
  try {
    const { username } = req.params; // Changed from userId to username
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const currentUserId = req.user?.UserID;

    // === Fetch user & privacy check ===
    const user = await prisma.user.findUnique({
      where: { Username: username }, // Changed from UserID to Username
      select: { UserID: true, Username: true, IsPrivate: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isOwner = currentUserId === user.UserID;
    let hasAccess = !user.IsPrivate || isOwner;

    if (user.IsPrivate && !isOwner && currentUserId) {
      const followRelationship = await prisma.follower.findFirst({
        where: {
          UserID: user.UserID,
          FollowerUserID: currentUserId,
          Status: "ACCEPTED",
        },
      });
      hasAccess = !!followRelationship;
    }
    if (!hasAccess) {
      return res.status(200).json({
        message: `@${user.Username} has a private account. You must follow them to view their posts.`,
        hasAccess: false,
        posts: [],
      });
    }

    // === Posts ===
    const posts = await prisma.post.findMany({
      skip: offset,
      take: parseInt(limit), // Fetch extra to account for filtering
      where: { UserID: user.UserID }, // Use user.UserID from fetched user
      orderBy: { CreatedAt: "desc" }, // Newest to oldest
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

    const filteredPosts = posts.filter(
      (p) => hasAccess || !p.User.IsPrivate || isOwner
    );
    const postIds = filteredPosts.map((p) => p.PostID);

    if (!postIds.length) {
      return res.json([]);
    }

    // === Batch Queries ===
    const [userLikes, userSaves, allLikes, allComments, userViews, following] =
      await Promise.all([
        prisma.like.findMany({
          where: { PostID: { in: postIds }, UserID: currentUserId },
          select: { PostID: true },
        }),
        prisma.savedPost.findMany({
          where: { PostID: { in: postIds }, UserID: currentUserId },
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
              select: {
                UserID: true,
                Username: true,
                ProfilePicture: true,
              },
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
        prisma.postView.findMany({
          where: { PostID: { in: postIds }, UserID: currentUserId },
          select: { PostID: true },
        }),
        currentUserId
          ? prisma.follower.findMany({
              where: { FollowerUserID: currentUserId, Status: "ACCEPTED" },
              select: { UserID: true },
            })
          : [],
      ]);

    const followingIds = following.map((f) => f.UserID);

    // === Group Data In Memory ===
    const likesByPost = groupBy(allLikes, (l) => l.PostID);
    const commentsByPost = groupBy(allComments, (c) => c.PostID);

    const formatted = filteredPosts.map((post) => {
      const isLiked = userLikes.some((l) => l.PostID === post.PostID);
      const isSaved = userSaves.some((s) => s.PostID === post.PostID);
      const isUnseen = !userViews.some((v) => v.PostID === post.PostID);
      const isFollowed = followingIds.includes(post.User.UserID);

      // === Likes ===
      const likes = likesByPost[post.PostID] || [];
      const myLike = likes.find((l) => l.User.UserID === currentUserId);
      const followingLikes = likes.filter(
        (l) =>
          followingIds.includes(l.User.UserID) &&
          l.User.UserID !== currentUserId
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
          c.UserID === currentUserId
            ? 0
            : followingIds.includes(c.UserID)
            ? 1
            : 2,
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
        isMine: comment.UserID === currentUserId,
        isLiked: comment.CommentLikes.some((l) => l.UserID === currentUserId),
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
          isMine: reply.UserID === currentUserId,
          isLiked: reply.CommentLikes.some((l) => l.UserID === currentUserId),
          likeCount: reply._count.CommentLikes,
          likedBy: reply.CommentLikes.map((l) => ({
            username: l.User.Username,
            profilePicture: l.User.ProfilePicture,
          })),
        })),
      }));

      return {
        ...post,
        isMine: post.User.UserID === currentUserId,
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

    // === Respond ===
    res.json(formatted);
  } catch (err) {
    logger.error(`Error fetching user posts: ${err.message}`);
    handleServerError(res, err, "Failed to fetch user posts");
  }
};

/**
 * Retrieves user's saved posts with full post details
 * - Same structure as getPosts/getUserPosts
 * - Includes pagination and post view tracking
 * - Prioritizes unseen posts, sorted strictly by save time (newest to oldest)
 * - Maintains same likes/comments/replies ordering as getPosts
 * - Handles shared posts and privacy checks
 */
const getSavedPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.UserID;

    // === Fetch saved post IDs with save time ===
    const saved = await prisma.savedPost.findMany({
      where: { UserID: userId },
      select: { PostID: true, CreatedAt: true }, // Include save time
      skip: offset,
      take: parseInt(limit) * 2, // Fetch extra to account for filtering
      orderBy: { CreatedAt: "desc" }, // Sort by save time (newest to oldest)
    });

    if (!saved.length) {
      return res.json([]);
    }

    const postIds = saved.map((s) => s.PostID);
    const saveTimes = new Map(saved.map((s) => [s.PostID, s.CreatedAt])); // Map PostID to save time

    // === Fetch following users for privacy checks ===
    const following = await prisma.follower.findMany({
      where: { FollowerUserID: userId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = following.map((f) => f.UserID);

    // === Fetch posts ===
    const posts = await prisma.post.findMany({
      where: { PostID: { in: postIds } },
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

    // === Filter posts based on privacy ===
    const filteredPosts = posts.filter(
      (p) =>
        !p.User.IsPrivate ||
        p.User.UserID === userId ||
        followingIds.includes(p.User.UserID)
    );
    const filteredPostIds = filteredPosts.map((p) => p.PostID);

    if (!filteredPostIds.length) {
      return res.json([]);
    }

    // === Batch Queries ===
    const [userLikes, userSaves, allLikes, allComments, userViews] =
      await Promise.all([
        prisma.like.findMany({
          where: { PostID: { in: filteredPostIds }, UserID: userId },
          select: { PostID: true },
        }),
        prisma.savedPost.findMany({
          where: { PostID: { in: filteredPostIds }, UserID: userId },
          select: { PostID: true },
        }),
        prisma.like.findMany({
          where: { PostID: { in: filteredPostIds } },
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
          where: { PostID: { in: filteredPostIds }, ParentCommentID: null },
          orderBy: { CreatedAt: "desc" },
          include: {
            User: {
              select: {
                UserID: true,
                Username: true,
                ProfilePicture: true,
              },
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
        prisma.postView.findMany({
          where: { PostID: { in: filteredPostIds }, UserID: userId },
          select: { PostID: true },
        }),
      ]);

    // === Group Data In Memory ===
    const likesByPost = groupBy(allLikes, (l) => l.PostID);
    const commentsByPost = groupBy(allComments, (c) => c.PostID);

    const formatted = filteredPosts.map((post) => {
      const isLiked = userLikes.some((l) => l.PostID === post.PostID);
      const isSaved = userSaves.some((s) => s.PostID === post.PostID);
      const isUnseen = !userViews.some((v) => v.PostID === post.PostID);
      const isFollowed = followingIds.includes(post.User.UserID);
      const saveTime = saveTimes.get(post.PostID); // Get save time for sorting

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
        saveTime, // Include save time for sorting
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

    // === Sort Strictly by Save Time ===
    const sorted = formatted
      .sort((a, b) => {
        return b.saveTime.getTime() - a.saveTime.getTime(); // Newer save time first
      })
      .slice(0, parseInt(limit));

    // === Respond ===
    res.json(sorted);
  } catch (err) {
    logger.error(`Error fetching saved posts: ${err.message}`);
    handleServerError(res, err, "Failed to fetch saved posts");
  }
};

/**
 * Retrieves paginated stories for the authenticated user.
 * - Supports limit & offset pagination
 * - Includes both expired and active stories.
 *
 * Query params:
 *   - limit (optional, default 10)
 *   - offset (optional, default 0)
 */
const getUserStories = async (req, res) => {
  const userId = req.user.UserID;
  const { limit = 10, offset = 0 } = req.query;

  try {
    const take = Math.min(Number(limit) || 10, 50); // safety cap
    const skip = Number(offset) || 0;

    const [stories, totalCount] = await Promise.all([
      prisma.story.findMany({
        where: { UserID: userId },
        select: {
          StoryID: true,
          MediaURL: true,
          CreatedAt: true,
        },
        orderBy: { CreatedAt: "desc" },
        skip,
        take,
      }),
      prisma.story.count({ where: { UserID: userId } }),
    ]);

    res.status(200).json({
      totalCount,
      limit: take,
      offset: skip,
      hasMore: skip + take < totalCount,
      stories: stories.map((story) => ({
        storyId: story.StoryID,
        mediaUrl: story.MediaURL,
        createdAt: story.CreatedAt,
      })),
    });
  } catch (error) {
    console.error("getUserStories error:", error);
    res.status(500).json({
      error: "Failed to fetch stories",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

/**
 * Custom rate limiter implementation using in-memory storage
 * Limits requests to 5 per minute per IP
 */
class RateLimiter {
  constructor() {
    this.limits = new Map();
    setInterval(() => this.cleanup(), 60000);
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, entries] of this.limits.entries()) {
      const filtered = entries.filter((time) => now - time < 60000);
      if (filtered.length > 0) {
        this.limits.set(ip, filtered);
      } else {
        this.limits.delete(ip);
      }
    }
  }

  async consume(ip) {
    const now = Date.now();
    if (!this.limits.has(ip)) {
      this.limits.set(ip, []);
    }

    const requests = this.limits.get(ip);
    const windowStart = now - 60000;
    const recentRequests = requests.filter((t) => t > windowStart);

    requests.push(now);
    return { remainingPoints: 5 - recentRequests.length - 1 };
  }
}

const rateLimiter = new RateLimiter();

/**
 * Handles follow requests with support for private accounts
 * Implements rate limiting
 */
const followUser = async (req, res) => {
  try {
    await rateLimiter.consume(req.ip);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const followerId = req.user.UserID;

    if (parseInt(userId) === followerId) {
      return res.status(400).json({ error: "Cannot follow yourself" });
    }

    const targetUser = await prisma.user.findUnique({
      where: { UserID: parseInt(userId) },
      select: {
        UserID: true,
        IsPrivate: true,
        Username: true,
        NotificationPreferences: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const existingFollow = await prisma.follower.findFirst({
      where: {
        UserID: targetUser.UserID,
        FollowerUserID: followerId,
      },
    });

    if (existingFollow) {
      if (existingFollow.Status === "PENDING") {
        return res.status(200).json({
          message: "Your follow request is still pending",
          status: "PENDING",
        });
      }

      const statusMap = {
        ACCEPTED: "You are already following this user",
        REJECTED: "Your previous follow request was rejected",
      };
      return res.status(409).json({
        error:
          statusMap[existingFollow.Status] || "Already following this user",
        status: existingFollow.Status,
      });
    }

    const follow = await prisma.follower.create({
      data: {
        UserID: targetUser.UserID,
        FollowerUserID: followerId,
        Status: targetUser.IsPrivate ? "PENDING" : "ACCEPTED",
      },
    });

    // Use NotificationService instead of prisma directly
    const shouldNotify =
      !targetUser.NotificationPreferences ||
      !targetUser.NotificationPreferences.NotificationTypes ||
      (targetUser.IsPrivate
        ? targetUser.NotificationPreferences.NotificationTypes.includes(
            "FOLLOW_REQUEST"
          )
        : targetUser.NotificationPreferences.NotificationTypes.includes(
            "FOLLOW"
          ));

    if (shouldNotify) {
      await NotificationService.createNotification({
        userId: targetUser.UserID,
        senderId: followerId,
        type: targetUser.IsPrivate ? "FOLLOW_REQUEST" : "FOLLOW",
        content: targetUser.IsPrivate
          ? `${req.user.Username} wants to follow you`
          : `${req.user.Username} started following you`,
        metadata: targetUser.IsPrivate
          ? {
              requestId: follow.FollowerID,
              requesterId: followerId,
              requesterUsername: req.user.Username,
            }
          : {
              followerId: followerId,
              followerUsername: req.user.Username,
            },
      });
    }

    res.status(201).json({
      message: targetUser.IsPrivate
        ? "Follow request sent"
        : "Successfully followed user",
      status: targetUser.IsPrivate ? "PENDING" : "ACCEPTED",
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/**
 * Removes follow relationship or pending follow request
 * Also deletes related FOLLOW_REQUEST notification if it exists
 */
const unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.UserID;

    const targetId = parseInt(userId);
    if (targetId === followerId) {
      return res.status(400).json({ error: "Cannot unfollow yourself" });
    }

    // Fetch follow record first (needed to remove related notification)
    const existingFollow = await prisma.follower.findFirst({
      where: {
        UserID: targetId,
        FollowerUserID: followerId,
      },
    });

    if (!existingFollow) {
      return res.status(404).json({ error: "Follow relationship not found" });
    }

    // Delete the follow record
    await prisma.follower.delete({
      where: { FollowerID: existingFollow.FollowerID },
    });

    let deletedNotificationIds = [];
    // If it was a pending follow request → delete the notification and emit IDs
    if (existingFollow.Status === "PENDING") {
      const notifIdsToDelete = await prisma.notification
        .findMany({
          where: {
            UserID: targetId, // the user who RECEIVED the request
            SenderID: followerId, // the requester
            Type: "FOLLOW_REQUEST",
            Metadata: {
              path: ["requestId"],
              equals: existingFollow.FollowerID,
            },
          },
          select: { NotificationID: true },
        })
        .then((n) => n.map((notif) => notif.NotificationID));

      deletedNotificationIds =
        await NotificationService.deleteNotificationsAndEmit(
          targetId,
          notifIdsToDelete
        );
    }

    return res.status(200).json({
      message: "Unfollowed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
};

/**
 * Removes a follower from the current user's followers list
 * Validates ownership and deletes relationship
 */
const removeFollower = async (req, res) => {
  try {
    const { followerId } = req.params; // follower to remove
    const userId = req.user.UserID; // current user

    const parsedFollowerId = parseInt(followerId);
    if (isNaN(parsedFollowerId)) {
      return res.status(400).json({ error: "Invalid follower ID format" });
    }

    const followRelationship = await prisma.follower.findFirst({
      where: {
        UserID: userId,
        FollowerUserID: parsedFollowerId,
        Status: "ACCEPTED",
      },
    });

    if (!followRelationship) {
      return res.status(404).json({ error: "Follower relationship not found" });
    }

    await prisma.follower.delete({
      where: { FollowerID: followRelationship.FollowerID },
    });

    res.status(200).json({ message: "Follower removed successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

/**
 * Accepts a pending follow request safely and deletes related notification
 */
const acceptFollowRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.UserID;

    const id = Number(requestId);
    if (!id) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    // Fetch follow record to get sender info + ensure existence
    const followRecord = await prisma.follower.findFirst({
      where: {
        FollowerID: id,
        UserID: userId,
        Status: "PENDING",
      },
      select: {
        FollowerID: true,
        FollowerUserID: true,
      },
    });

    if (!followRecord) {
      return res.status(404).json({
        error: "Follow request not found or already processed",
      });
    }

    // Mark request as accepted safely
    await prisma.follower.updateMany({
      where: {
        FollowerID: id,
        UserID: userId,
        Status: "PENDING",
      },
      data: {
        Status: "ACCEPTED",
        UpdatedAt: new Date(),
      },
    });

    // Delete related FOLLOW_REQUEST notifications and emit deleted IDs
    const deletedNotificationIds =
      await NotificationService.deleteNotificationsAndEmit(userId, [
        ...(await prisma.notification
          .findMany({
            where: {
              UserID: userId, // who RECEIVED the request
              SenderID: followRecord.FollowerUserID, // who SENT the request
              Type: "FOLLOW_REQUEST",
              Metadata: {
                path: ["requestId"],
                equals: followRecord.FollowerID,
              },
            },
            select: { NotificationID: true },
          })
          .then((n) => n.map((notif) => notif.NotificationID))),
      ]);

    // Get updated accepted followers list
    const acceptedFollowers = await prisma.follower.findMany({
      where: {
        UserID: userId,
        Status: "ACCEPTED",
      },
      select: {
        FollowerUser: {
          select: {
            UserID: true,
            Username: true,
            ProfilePicture: true,
          },
        },
      },
    });

    return res.status(200).json({
      message: "Follow request accepted",
      acceptedFollowers: acceptedFollowers.map((f) => f.FollowerUser),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves pending follow requests for the current user
 * Includes basic requester information
 */
const getPendingFollowRequests = async (req, res) => {
  try {
    const userId = req.user.UserID;

    const requests = await prisma.follower.findMany({
      where: {
        UserID: userId,
        Status: "PENDING",
      },
      include: {
        FollowerUser: {
          select: {
            UserID: true,
            Username: true,
            ProfileName: true,
            ProfilePicture: true,
            Bio: true,
          },
        },
      },
      orderBy: {
        CreatedAt: "desc",
      },
    });

    res.status(200).json({
      count: requests.length,
      pendingRequests: requests.map((r) => ({
        requestId: r.FollowerID,
        user: {
          userId: r.FollowerUser.UserID,
          username: r.FollowerUser.Username,
          profileName: r.FollowerUser.ProfileName,
          profilePicture: r.FollowerUser.ProfilePicture,
          bio: r.FollowerUser.Bio,
        },
        createdAt: r.CreatedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Rejects a follow request safely and deletes related notification
 */
const rejectFollowRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.UserID;

    const id = Number(requestId);
    if (!id) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    // Check existence first (without throwing errors)
    const followRecord = await prisma.follower.findFirst({
      where: {
        FollowerID: id,
        UserID: userId,
        Status: "PENDING",
      },
      select: {
        FollowerID: true,
        FollowerUserID: true,
      },
    });

    if (!followRecord) {
      return res.status(404).json({
        error: "Follow request not found or already processed",
      });
    }

    // Delete follow request safely
    await prisma.follower.deleteMany({
      where: {
        FollowerID: id,
        UserID: userId,
        Status: "PENDING",
      },
    });

    // Delete the related FOLLOW_REQUEST notification and emit deleted IDs
    const deletedNotificationIds =
      await NotificationService.deleteNotificationsAndEmit(userId, [
        ...(await prisma.notification
          .findMany({
            where: {
              UserID: userId,
              SenderID: followRecord.FollowerUserID,
              Type: "FOLLOW_REQUEST",
              Metadata: {
                path: ["requestId"],
                equals: followRecord.FollowerID,
              },
            },
            select: { NotificationID: true },
          })
          .then((n) => n.map((notif) => notif.NotificationID))),
      ]);

    return res.status(200).json({
      message: "Follow request rejected",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves user's followers with privacy checks
 * Order:
 *  1. Current user (if follower)
 *  2. Users followed by current user
 *  3. Other followers
 * Ensures no duplicates
 * Supports pagination with page & limit
 */
const getFollowers = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user?.UserID;
    const { page = 1, limit = 20 } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    // 🔒 Validate inputs
    if (!currentUserId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length === 0
    ) {
      return res.status(400).json({ error: "Invalid username format" });
    }
    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ error: "Invalid page number" });
    }
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: "Limit must be between 1 and 100" });
    }

    const skip = (parsedPage - 1) * parsedLimit;

    // Fetch user by username
    const user = await prisma.user.findFirst({
      where: { Username: { equals: username, mode: "insensitive" } },
      select: { UserID: true, IsPrivate: true, Username: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // privacy
    const isOwner = currentUserId === user.UserID;
    let hasAccess = !user.IsPrivate || isOwner;

    if (user.IsPrivate && !isOwner) {
      const followRelationship = await prisma.follower.findFirst({
        where: {
          UserID: user.UserID,
          FollowerUserID: currentUserId,
          Status: "ACCEPTED",
        },
      });
      hasAccess = !!followRelationship;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: "Private account",
        message: `You must follow @${user.Username} to view their followers`,
      });
    }

    // Users currentUser follows (for prioritization)
    const currentUserFollowing = await prisma.follower.findMany({
      where: { FollowerUserID: currentUserId, Status: "ACCEPTED" },
      select: { UserID: true },
    });
    const followingIds = new Set(currentUserFollowing.map((f) => f.UserID));

    const pendingUserFollowing = await prisma.follower.findMany({
      where: { FollowerUserID: currentUserId, Status: "PENDING" },
      select: { UserID: true },
    });
    const pendingIds = new Set(pendingUserFollowing.map((f) => f.UserID));

    // Count followers
    const totalCount = await prisma.follower.count({
      where: { UserID: user.UserID, Status: "ACCEPTED" },
    });

    // Fetch followers
    const followers = await prisma.follower.findMany({
      where: { UserID: user.UserID, Status: "ACCEPTED" },
      select: {
        FollowerUser: {
          select: {
            UserID: true,
            Username: true,
            ProfileName: true,
            ProfilePicture: true,
            IsPrivate: true,
            Bio: true,
          },
        },
        CreatedAt: true,
      },
      orderBy: { CreatedAt: "desc" },
      skip,
      take: parsedLimit,
    });

    // Deduplicate + prioritize
    const seen = new Set();
    const prioritizedFollowers = [];

    for (const f of followers) {
      const u = f.FollowerUser;
      if (!u || seen.has(u.UserID)) continue;
      seen.add(u.UserID);

      prioritizedFollowers.push({
        userId: u.UserID,
        username: u.Username,
        profileName: u.ProfileName,
        profilePicture: u.ProfilePicture,
        isPrivate: u.IsPrivate,
        bio: u.Bio,
        isFollowed: followingIds.has(u.UserID)
          ? true
          : pendingIds.has(u.UserID)
          ? "pending"
          : false,
        isCurrentUser: u.UserID === currentUserId,
        followCreatedAt: f.CreatedAt,
      });
    }

    // Sort by priority
    prioritizedFollowers.sort((a, b) => {
      // 1. current user first
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return 1;

      // 2. followed by current user
      if (a.isFollowed && !b.isFollowed) return -1;
      if (!a.isFollowed && b.isFollowed) return 1;

      // 3. fallback: followCreatedAt (recent first)
      return new Date(b.followCreatedAt) - new Date(a.followCreatedAt);
    });

    // Response
    const response = {
      count: prioritizedFollowers.length,
      totalCount,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(totalCount / parsedLimit),
      followers: prioritizedFollowers.map((f) => ({
        userId: f.userId,
        username: f.username,
        profileName: f.profileName,
        profilePicture: f.profilePicture,
        isPrivate: f.isPrivate,
        bio: f.bio,
        isFollowed: f.isFollowed,
      })),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("getFollowers error:", error);
    res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Retrieves users being followed with privacy checks
 * Prioritizes the current user (if following), then users followed by the current user, then others, sorted by recent interactions
 * Supports pagination with page and limit query parameters
 * For private accounts, verifies follow status before showing
 * Uses username (case-insensitive) instead of userId
 */
const getFollowing = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user?.UserID;
    const { page = 1, limit = 20 } = req.query; // Default to page 1, limit 20
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    // Validate inputs
    if (!currentUserId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length === 0
    ) {
      return res.status(400).json({ error: "Invalid username format" });
    }
    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ error: "Invalid page number" });
    }
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: "Limit must be between 1 and 100" });
    }

    // Calculate pagination
    const skip = (parsedPage - 1) * parsedLimit;

    // Fetch user by username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: { Username: { equals: username, mode: "insensitive" } },
      select: {
        UserID: true,
        IsPrivate: true,
        Username: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check access for private accounts
    const isOwner = currentUserId === user.UserID;
    let hasAccess = !user.IsPrivate || isOwner;

    if (user.IsPrivate && !isOwner) {
      const followRelationship = await prisma.follower.findFirst({
        where: {
          UserID: user.UserID,
          FollowerUserID: currentUserId,
          Status: "ACCEPTED",
        },
      });
      hasAccess = followRelationship !== null;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: "Private account",
        message: `You must follow @${user.Username} to view who they follow`,
      });
    }

    // Get users followed by the current user for prioritization
    const currentUserFollowing = await prisma.follower.findMany({
      where: {
        FollowerUserID: currentUserId,
        Status: "ACCEPTED",
      },
      select: { UserID: true },
    });
    const followingIds = currentUserFollowing.map((f) => f.UserID);

    // Get total count of following for pagination metadata
    const totalCount = await prisma.follower.count({
      where: {
        FollowerUserID: user.UserID,
        Status: "ACCEPTED",
      },
    });

    // Fetch following with interaction data
    const following = await prisma.follower.findMany({
      where: {
        FollowerUserID: user.UserID,
        Status: "ACCEPTED",
      },
      select: {
        User: {
          select: {
            UserID: true,
            Username: true,
            ProfileName: true,
            ProfilePicture: true,
            IsPrivate: true,
            Bio: true,
            Likes: {
              select: { CreatedAt: true },
              orderBy: { CreatedAt: "desc" },
              take: 1,
            },
            Comments: {
              select: { CreatedAt: true },
              orderBy: { CreatedAt: "desc" },
              take: 1,
            },
            StoryViews: {
              select: { ViewedAt: true },
              orderBy: { ViewedAt: "desc" },
              take: 1,
            },
          },
        },
        CreatedAt: true,
      },
      orderBy: { CreatedAt: "desc" },
      skip,
      take: parsedLimit,
    });

    // Map and prioritize following
    const prioritizedFollowing = following
      .map((f) => {
        const { User, CreatedAt } = f;
        const latestLike = User.Likes[0]?.CreatedAt;
        const latestComment = User.Comments[0]?.CreatedAt;
        const latestStoryView = User.StoryViews[0]?.ViewedAt;

        // Determine the most recent interaction time
        const latestInteraction = [latestLike, latestComment, latestStoryView]
          .filter((date) => date)
          .reduce((latest, current) => {
            return !latest || new Date(current) > new Date(latest)
              ? current
              : latest;
          }, null);

        return {
          userId: User.UserID,
          username: User.Username,
          profileName: User.ProfileName,
          profilePicture: User.ProfilePicture,
          isPrivate: User.IsPrivate,
          bio: User.Bio,
          isFollowed: followingIds.includes(User.UserID),
          isCurrentUser: User.UserID === currentUserId,
          latestInteraction: latestInteraction
            ? new Date(latestInteraction).toISOString()
            : null,
          followCreatedAt: CreatedAt,
        };
      })
      .sort((a, b) => {
        // Prioritize current user
        if (a.isCurrentUser) return -1;
        if (b.isCurrentUser) return 1;

        // Then prioritize users followed by the current user
        const aIsFollowed = a.isFollowed;
        const bIsFollowed = b.isFollowed;
        if (aIsFollowed && !bIsFollowed) return -1;
        if (!aIsFollowed && bIsFollowed) return 1;

        // Sort by latest interaction
        if (a.latestInteraction && b.latestInteraction) {
          return new Date(b.latestInteraction) - new Date(a.latestInteraction);
        }
        if (a.latestInteraction) return -1;
        if (b.latestInteraction) return 1;

        // Fallback to follow creation date
        return new Date(b.followCreatedAt) - new Date(a.followCreatedAt);
      });

    const response = {
      count: prioritizedFollowing.length,
      totalCount,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(totalCount / parsedLimit),
      following: prioritizedFollowing.map((f) => ({
        userId: f.userId,
        username: f.username,
        profileName: f.profileName,
        profilePicture: f.profilePicture,
        isPrivate: f.isPrivate,
        bio: f.bio,
        isFollowed: f.isFollowed,
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("getFollowing error:", error);
    res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Retrieves random user suggestions that the current user is not following
 * Excludes the current user and banned users
 */
const getUserSuggestions = async (req, res) => {
  try {
    const currentUserId = req.user.UserID;
    const limit = parseInt(req.query.limit) || 5;

    if (limit < 1 || limit > 50) {
      return res.status(400).json({ error: "Limit must be between 1 and 50" });
    }

    // Get IDs of users the current user is following
    const following = await prisma.follower.findMany({
      where: {
        FollowerUserID: currentUserId,
        Status: "ACCEPTED",
      },
      select: {
        UserID: true,
      },
    });
    const followingIds = following.map((f) => f.UserID);

    const pendingFollows = await prisma.follower.findMany({
      where: {
        FollowerUserID: currentUserId,
        Status: "PENDING",
      },
      select: {
        UserID: true,
      },
    });
    const pendingFollowIds = pendingFollows.map((f) => f.UserID);
    console.log("pendingFollowIds", pendingFollowIds);

    // Get all eligible user IDs (excluding current user, banned users, and followed users)
    const eligibleUsers = await prisma.user.findMany({
      where: {
        UserID: {
          notIn: [currentUserId, ...followingIds, ...pendingFollowIds],
        },
        IsBanned: false,
      },
      select: {
        UserID: true,
      },
    });

    if (eligibleUsers.length === 0) {
      return res.status(200).json({
        count: 0,
        suggestions: [],
      });
    }

    // Shuffle user IDs to ensure true randomness
    const shuffledUserIds = shuffleArray(
      eligibleUsers.map((user) => user.UserID)
    );
    const selectedUserIds = shuffledUserIds.slice(0, limit);

    // Fetch user details for the selected IDs
    const users = await prisma.user.findMany({
      where: {
        UserID: {
          in: selectedUserIds,
        },
      },
      select: {
        UserID: true,
        Username: true,
        ProfilePicture: true,
        Bio: true,
      },
    });

    // Ensure the response order matches the shuffled order
    const orderedUsers = selectedUserIds
      .map((id) => users.find((user) => user.UserID === id))
      .filter((user) => user); // Remove any undefined entries

    const response = {
      count: orderedUsers.length,
      suggestions: orderedUsers.map((user) => ({
        userId: user.UserID,
        username: user.Username,
        profilePicture: user.ProfilePicture,
        bio: user.Bio,
        isFollowed: false,
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("getUserSuggestions error:", error);
    res.status(500).json({
      error: "Internal server error",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  getProfileByUsername,
  getProfile,
  updateProfile,
  changePassword,
  updatePrivacySettings,
  deleteProfile,
  getUserPosts,
  getSavedPosts,
  getUserStories,
  followUser,
  unfollowUser,
  removeFollower,
  getFollowers,
  getFollowing,
  acceptFollowRequest,
  rejectFollowRequest,
  getPendingFollowRequests,
  getUserSuggestions,
};
