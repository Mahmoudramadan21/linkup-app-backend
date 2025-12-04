const express = require("express");
const router = express.Router();
const authRoutes = require("./authRoutes");
const profileRoutes = require("./profileRoutes");
const postRoutes = require("./postRoutes");
const storyRoutes = require("./storyRoutes");
const messagesRoutes = require("./messagesRoutes");
const highlightRoutes = require("./highlightRoutes");
const adminRoutes = require("./adminRoutes");
const notificationRoutes = require("./notificationRoutes");
const testRoutes = require("./testRoutes");
const searchRoutes = require("./searchRoutes");

router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/posts", postRoutes);
router.use("/stories", storyRoutes);
router.use('/messages', messagesRoutes);
router.use("/highlights", highlightRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationRoutes);
router.use("/test", testRoutes);
router.use("/search", searchRoutes);

module.exports = router;
