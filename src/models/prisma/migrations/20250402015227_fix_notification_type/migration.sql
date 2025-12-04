/*
  Warnings:

  - A unique constraint covering the columns `[UserID,FollowerUserID]` on the table `Follower` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `UpdatedAt` to the `Follower` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `Type` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW_REQUEST', 'FOLLOW_ACCEPTED', 'FOLLOW', 'LIKE', 'COMMENT', 'MESSAGE');

-- AlterTable
ALTER TABLE "Follower" ADD COLUMN     "Status" "FollowStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "UpdatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "Metadata" JSONB,
DROP COLUMN "Type",
ADD COLUMN     "Type" "NotificationType" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Follower_UserID_FollowerUserID_key" ON "Follower"("UserID", "FollowerUserID");
