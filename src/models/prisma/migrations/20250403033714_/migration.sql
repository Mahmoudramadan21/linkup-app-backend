-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_PostID_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_UserID_fkey";

-- DropForeignKey
ALTER TABLE "Follower" DROP CONSTRAINT "Follower_FollowerUserID_fkey";

-- DropForeignKey
ALTER TABLE "Follower" DROP CONSTRAINT "Follower_UserID_fkey";

-- DropForeignKey
ALTER TABLE "Highlight" DROP CONSTRAINT "Highlight_UserID_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_PostID_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_UserID_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_ReceiverID_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_SenderID_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_UserID_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_UserID_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_PostID_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_UserID_fkey";

-- DropForeignKey
ALTER TABLE "SavedPost" DROP CONSTRAINT "SavedPost_PostID_fkey";

-- DropForeignKey
ALTER TABLE "SavedPost" DROP CONSTRAINT "SavedPost_UserID_fkey";

-- DropForeignKey
ALTER TABLE "Story" DROP CONSTRAINT "Story_UserID_fkey";

-- DropForeignKey
ALTER TABLE "SupportRequest" DROP CONSTRAINT "SupportRequest_UserID_fkey";

-- DropForeignKey
ALTER TABLE "_StoryToHighlights" DROP CONSTRAINT "_StoryToHighlights_A_fkey";

-- DropForeignKey
ALTER TABLE "_StoryToHighlights" DROP CONSTRAINT "_StoryToHighlights_B_fkey";
