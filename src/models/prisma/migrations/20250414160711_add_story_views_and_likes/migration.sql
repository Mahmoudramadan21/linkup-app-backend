-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STORY_LIKE';

-- CreateTable
CREATE TABLE "StoryView" (
    "ViewID" SERIAL NOT NULL,
    "StoryID" INTEGER NOT NULL,
    "UserID" INTEGER NOT NULL,
    "ViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("ViewID")
);

-- CreateTable
CREATE TABLE "StoryLike" (
    "LikeID" SERIAL NOT NULL,
    "StoryID" INTEGER NOT NULL,
    "UserID" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryLike_pkey" PRIMARY KEY ("LikeID")
);

-- CreateIndex
CREATE INDEX "StoryView_StoryID_idx" ON "StoryView"("StoryID");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_StoryID_UserID_key" ON "StoryView"("StoryID", "UserID");

-- CreateIndex
CREATE INDEX "StoryLike_StoryID_idx" ON "StoryLike"("StoryID");

-- CreateIndex
CREATE UNIQUE INDEX "StoryLike_UserID_StoryID_key" ON "StoryLike"("UserID", "StoryID");

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_StoryID_fkey" FOREIGN KEY ("StoryID") REFERENCES "Story"("StoryID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "User"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_StoryID_fkey" FOREIGN KEY ("StoryID") REFERENCES "Story"("StoryID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "User"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;
