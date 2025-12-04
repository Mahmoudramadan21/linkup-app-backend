const prisma = require("../utils/prisma");
const { handleServerError } = require("../utils/errorHandler");
const { del } = require("../utils/redisUtils"); // Update to use redisUtils

/**
 * Fetches reported posts with pagination
 * Returns 400 for invalid status
 */
const getReportedPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = "PENDING" } = req.query;

    // Validate status
    if (!["PENDING", "RESOLVED", "DISMISSED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));

    // Fetch reports with post and user data
    const reports = await prisma.report.findMany({
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      where: { Status: status },
      include: {
        Post: {
          include: {
            User: { select: { UserID: true, Username: true } },
          },
        },
        Reporter: { select: { UserID: true, Username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Count total reports for pagination
    const total = await prisma.report.count({ where: { Status: status } });

    // Group reports by post ID
    const groupedReports = reports.reduce((acc, report) => {
      const postId = report.Post.PostID;
      if (!acc[postId]) {
        acc[postId] = {
          postId,
          content: report.Post.Content,
          createdAt: report.Post.CreatedAt,
          reporterUsernames: [],
          reportCount: 0,
          owner: report.Post.User.Username,
        };
      }
      acc[postId].reporterUsernames.push(report.Reporter.Username);
      acc[postId].reportCount += 1;
      return acc;
    }, {});

    // Format response with pagination metadata
    const formattedData = Object.values(groupedReports);
    res.json({
      data: formattedData,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    handleServerError(res, error, "Failed to fetch reported posts");
  }
};

/**
 * Retrieves all users with pagination
 * Supports search by username or email
 */
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));

    // Define search conditions
    const where = {
      OR: [
        { Username: { contains: search, mode: "insensitive" } },
        { Email: { contains: search, mode: "insensitive" } },
      ],
    };

    // Fetch users with post and report counts
    const users = await prisma.user.findMany({
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      where,
      select: {
        UserID: true,
        Username: true,
        Email: true,
        Role: true,
        IsBanned: true,
        CreatedAt: true,
        _count: {
          select: {
            Posts: true,
            Reports: true,
          },
        },
        Posts: {
          select: {
            _count: {
              select: {
                Reports: true,
              },
            },
          },
        },
      },
      orderBy: { CreatedAt: "desc" },
    });

    // Count total users for pagination
    const total = await prisma.user.count({ where });

    // Format response with counts
    res.json({
      data: users.map((user) => ({
        userId: user.UserID,
        username: user.Username,
        email: user.Email,
        role: user.Role,
        isBanned: user.IsBanned,
        createdAt: user.CreatedAt,
        postCount: user._count.Posts,
        filedReportCount: user._count.Reports,
        reportedPostCount: user.Posts.reduce(
          (sum, post) => sum + post._count.Reports,
          0
        ),
      })),
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    handleServerError(res, error, "Failed to fetch users");
  }
};

/**
 * Fetches details for a specific user
 * Returns 404 if user not found
 */
const getUserDetails = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Fetch user by ID
    const user = await prisma.user.findUnique({
      where: { UserID: userId },
      select: {
        UserID: true,
        Username: true,
        Email: true,
        Role: true,
        IsBanned: true,
        CreatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Format response
    res.json({
      data: {
        userId: user.UserID,
        username: user.Username,
        email: user.Email,
        role: user.Role,
        isBanned: user.IsBanned,
        createdAt: user.CreatedAt,
      },
    });
  } catch (error) {
    handleServerError(res, error, "Failed to fetch user details");
  }
};

/**
 * Updates user role or ban status
 * Requires admin permissions
 */
const updateUser = async (req, res) => {
  try {
    const { userId, role, isBanned, reason } = req.body;
    const adminId = req.user.UserID;

    // Verify admin permissions
    if (req.user.Role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Validate inputs
    if (!userId || (role === undefined && isBanned === undefined)) {
      return res.status(400).json({
        error: "User ID and at least one field (role or isBanned) are required",
      });
    }

    const parsedUserId = parseInt(userId);
    if (isNaN(parsedUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Prevent self-action
    if (parsedUserId === adminId) {
      return res.status(400).json({ error: "Cannot modify your own account" });
    }

    // Validate role if provided
    if (role !== undefined) {
      const validRoles = ["USER", "ADMIN", "BANNED"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role value" });
      }
    }

    // Validate isBanned if provided
    if (isBanned !== undefined && typeof isBanned !== "boolean") {
      return res.status(400).json({ error: "isBanned must be a boolean" });
    }

    // Validate reason if banning
    if (isBanned === true && (!reason || reason.trim().length < 5)) {
      return res.status(400).json({
        error: "Reason must be at least 5 characters when banning a user",
      });
    }

    // Verify user exists
    const userExists = await prisma.user.findUnique({
      where: { UserID: parsedUserId },
      select: { UserID: true, Username: true, IsBanned: true },
    });
    if (!userExists) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prepare update data
    const updateData = {};
    if (role !== undefined) updateData.Role = role;
    if (isBanned !== undefined) {
      updateData.IsBanned = isBanned;
      updateData.BanReason = isBanned ? reason || null : null;
    }

    // Create audit log
    const auditLog = await prisma.auditLog.create({
      data: {
        Action: "UPDATE_USER",
        AdminID: adminId,
        Details: JSON.stringify({
          userId: parsedUserId,
          role,
          isBanned,
          reason,
        }),
      },
    });

    // Send notifications for changes
    const notifications = [];
    if (isBanned === true && !userExists.IsBanned) {
      notifications.push(
        prisma.notification.create({
          data: {
            UserID: parsedUserId,
            Type: "ADMIN_WARNING",
            Content: `Your account has been banned: ${reason}`,
            Metadata: { AdminID: adminId, AuditLogID: auditLog.AuditLogID },
          },
        })
      );
    } else if (isBanned === false && userExists.IsBanned) {
      notifications.push(
        prisma.notification.create({
          data: {
            UserID: parsedUserId,
            Type: "ADMIN_WARNING",
            Content: "Your account has been unbanned",
            Metadata: { AdminID: adminId, AuditLogID: auditLog.AuditLogID },
          },
        })
      );
    }
    if (role !== undefined) {
      notifications.push(
        prisma.notification.create({
          data: {
            UserID: parsedUserId,
            Type: "ADMIN_WARNING",
            Content: `Your role has been changed to ${role}`,
            Metadata: { AdminID: adminId, AuditLogID: auditLog.AuditLogID },
          },
        })
      );
    }

    // Execute update and notifications
    await prisma.$transaction([
      prisma.user.update({
        where: { UserID: parsedUserId },
        data: updateData,
      }),
      ...notifications,
    ]);

    res.json({
      success: true,
      message: `User ${parsedUserId} updated successfully`,
      auditLogId: auditLog.AuditLogID,
    });
  } catch (error) {
    handleServerError(res, error, "Failed to update user");
  }
};

/**
 * Performs admin actions on posts or users
 * Creates audit log for all actions
 */
const takeAction = async (req, res) => {
  try {
    const { actionType, postId, userId, reason } = req.body;
    const adminId = req.user.UserID;

    // Verify admin permissions
    if (req.user.Role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Validate inputs
    if (!actionType || (!postId && !userId) || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (reason.trim().length < 5) {
      return res
        .status(400)
        .json({ error: "Reason must be at least 5 characters" });
    }

    // Prevent self-action
    if (userId && parseInt(userId) === adminId) {
      return res
        .status(400)
        .json({ error: "Cannot perform action on yourself" });
    }

    // Validate action type
    const validActions = [
      "DELETE_POST",
      "WARN_USER",
      "BAN_USER",
      "DISMISS_REPORT",
    ];
    if (!validActions.includes(actionType)) {
      return res.status(400).json({ error: "Invalid action type" });
    }

    // Create audit log
    const auditLog = await prisma.auditLog.create({
      data: {
        Action: actionType,
        AdminID: adminId,
        Details: JSON.stringify({ postId, userId, reason }),
      },
    });

    let responseMessage;
    switch (actionType) {
      case "DELETE_POST":
        if (!postId) {
          return res
            .status(400)
            .json({ error: "Post ID required for DELETE_POST" });
        }
        const parsedPostId = parseInt(postId);
        if (isNaN(parsedPostId)) {
          return res.status(400).json({ error: "Invalid post ID" });
        }

        // Check if post exists
        const post = await prisma.post.findUnique({
          where: { PostID: parsedPostId },
          select: { PostID: true, UserID: true },
        });
        if (!post) {
          return res.status(404).json({ error: "Post not found" });
        }

        // Delete post and related data, including notification
        await prisma.$transaction([
          prisma.comment.deleteMany({ where: { PostID: parsedPostId } }),
          prisma.like.deleteMany({ where: { PostID: parsedPostId } }),
          prisma.report.deleteMany({ where: { PostID: parsedPostId } }),
          prisma.savedPost.deleteMany({ where: { PostID: parsedPostId } }),
          prisma.post.delete({ where: { PostID: parsedPostId } }),
          prisma.notification.create({
            data: {
              UserID: post.UserID,
              Type: "ADMIN_WARNING",
              Content: `Your post has been deleted: ${reason}`,
              Metadata: {
                AdminID: adminId,
                AuditLogID: auditLog.AuditLogID,
                PostID: parsedPostId,
              },
            },
          }),
        ]);

        // Invalidate cache for post-related data using redisUtils
        await del(`posts:user:${post.UserID}`, post.UserID);
        await del(`post:${parsedPostId}`, post.UserID);

        responseMessage = `Post ${parsedPostId} deleted successfully`;
        break;

      case "WARN_USER":
        if (!userId) {
          return res
            .status(400)
            .json({ error: "User ID required for WARN_USER" });
        }
        const userExistsWarn = await prisma.user.findUnique({
          where: { UserID: parseInt(userId) },
        });
        if (!userExistsWarn) {
          return res.status(404).json({ error: "User not found" });
        }
        await prisma.notification.create({
          data: {
            UserID: parseInt(userId),
            Type: "ADMIN_WARNING",
            Content: reason,
            Metadata: { AdminID: adminId, AuditLogID: auditLog.AuditLogID },
          },
        });
        responseMessage = `User ${userId} warned successfully`;
        break;

      case "BAN_USER":
        if (!userId) {
          return res
            .status(400)
            .json({ error: "User ID required for BAN_USER" });
        }
        const userExistsBan = await prisma.user.findUnique({
          where: { UserID: parseInt(userId) },
        });
        if (!userExistsBan) {
          return res.status(404).json({ error: "User not found" });
        }
        await prisma.$transaction([
          prisma.user.update({
            where: { UserID: parseInt(userId) },
            data: { IsBanned: true, BanReason: reason },
          }),
          prisma.notification.create({
            data: {
              UserID: parseInt(userId),
              Type: "ADMIN_WARNING",
              Content: `Your account has been banned: ${reason}`,
              Metadata: { AdminID: adminId, AuditLogID: auditLog.AuditLogID },
            },
          }),
        ]);
        responseMessage = `User ${userId} banned successfully`;
        break;

      case "DISMISS_REPORT":
        if (!postId) {
          return res
            .status(400)
            .json({ error: "Post ID required for DISMISS_REPORT" });
        }
        const reportExists = await prisma.report.findFirst({
          where: { PostID: parseInt(postId) },
        });
        if (!reportExists) {
          return res.status(404).json({ error: "Report not found" });
        }
        await prisma.report.updateMany({
          where: { PostID: parseInt(postId) },
          data: { Status: "DISMISSED" },
        });
        responseMessage = `Reports for post ${postId} dismissed`;
        break;

      default:
        return res.status(400).json({ error: "Invalid action type" });
    }

    res.json({
      success: true,
      message: responseMessage,
      auditLogId: auditLog.AuditLogID,
    });
  } catch (error) {
    handleServerError(res, error, "Failed to execute admin action");
  }
};

module.exports = {
  getReportedPosts,
  getAllUsers,
  getUserDetails,
  updateUser,
  takeAction,
};
