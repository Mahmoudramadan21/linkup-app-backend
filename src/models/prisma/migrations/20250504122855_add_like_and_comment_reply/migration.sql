-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_LIKE';
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_REPLY';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "parentCommentId" INTEGER;

-- CreateTable
CREATE TABLE "CommentLike" (
    "LikeID" SERIAL NOT NULL,
    "CommentID" INTEGER NOT NULL,
    "UserID" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("LikeID")
);

-- CreateIndex
CREATE INDEX "CommentLike_CommentID_idx" ON "CommentLike"("CommentID");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_UserID_CommentID_key" ON "CommentLike"("UserID", "CommentID");

-- CreateIndex
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("CommentID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_CommentID_fkey" FOREIGN KEY ("CommentID") REFERENCES "Comment"("CommentID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "User"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;
