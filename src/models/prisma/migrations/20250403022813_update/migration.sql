/*
  Warnings:

  - A unique constraint covering the columns `[UserID,PostID]` on the table `Like` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "Comment_PostID_CreatedAt_idx" ON "Comment"("PostID", "CreatedAt");

-- CreateIndex
CREATE INDEX "Follower_UserID_Status_idx" ON "Follower"("UserID", "Status");

-- CreateIndex
CREATE INDEX "Follower_FollowerUserID_idx" ON "Follower"("FollowerUserID");

-- CreateIndex
CREATE UNIQUE INDEX "Like_UserID_PostID_key" ON "Like"("UserID", "PostID");

-- CreateIndex
CREATE INDEX "Post_CreatedAt_idx" ON "Post"("CreatedAt");

-- CreateIndex
CREATE INDEX "Post_UserID_CreatedAt_idx" ON "Post"("UserID", "CreatedAt");
