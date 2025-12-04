/*
  Warnings:

  - You are about to drop the `_StoryToHighlights` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StoryLike" DROP CONSTRAINT "StoryLike_StoryID_fkey";

-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_StoryID_fkey";

-- DropForeignKey
ALTER TABLE "_StoryToHighlights" DROP CONSTRAINT "_StoryToHighlights_A_fkey";

-- DropForeignKey
ALTER TABLE "_StoryToHighlights" DROP CONSTRAINT "_StoryToHighlights_B_fkey";

-- DropTable
DROP TABLE "_StoryToHighlights";

-- CreateTable
CREATE TABLE "StoryHighlight" (
    "StoryID" INTEGER NOT NULL,
    "HighlightID" INTEGER NOT NULL,
    "AssignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryHighlight_pkey" PRIMARY KEY ("StoryID","HighlightID")
);

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_StoryID_fkey" FOREIGN KEY ("StoryID") REFERENCES "Story"("StoryID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_StoryID_fkey" FOREIGN KEY ("StoryID") REFERENCES "Story"("StoryID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryHighlight" ADD CONSTRAINT "StoryHighlight_StoryID_fkey" FOREIGN KEY ("StoryID") REFERENCES "Story"("StoryID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryHighlight" ADD CONSTRAINT "StoryHighlight_HighlightID_fkey" FOREIGN KEY ("HighlightID") REFERENCES "Highlight"("HighlightID") ON DELETE CASCADE ON UPDATE CASCADE;
