const prisma = require("../utils/prisma");

/**
 * Verifies if the user owns the post or has admin privileges
 * @param {Object} req - Express request object with user and params
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const checkPostOwnership = async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user.UserID;
  const isAdmin = req.user.Role === "ADMIN";

  try {
    // Fetch post owner ID from database
    const post = await prisma.post.findUnique({
      where: { PostID: parseInt(postId) },
      select: { UserID: true },
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Allow admin or owner to proceed
    if (post.UserID !== userId && !isAdmin) {
      return res.status(403).json({
        error: "You don't have permission to perform this action",
      });
    }

    // Attach post to request for downstream use
    req.post = post;
    next();
  } catch (error) {
    console.error("Ownership check error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
};

module.exports = checkPostOwnership;
