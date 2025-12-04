-- CreateTable
CREATE TABLE "Highlight" (
    "HighlightID" SERIAL NOT NULL,
    "UserID" INTEGER NOT NULL,
    "Title" VARCHAR(50) NOT NULL,
    "CoverImage" TEXT NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("HighlightID")
);

-- CreateTable
CREATE TABLE "_StoryToHighlights" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_StoryToHighlights_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Highlight_UserID_idx" ON "Highlight"("UserID");

-- CreateIndex
CREATE INDEX "Highlight_CreatedAt_idx" ON "Highlight"("CreatedAt");

-- CreateIndex
CREATE INDEX "_StoryToHighlights_B_index" ON "_StoryToHighlights"("B");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "User"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoryToHighlights" ADD CONSTRAINT "_StoryToHighlights_A_fkey" FOREIGN KEY ("A") REFERENCES "Highlight"("HighlightID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StoryToHighlights" ADD CONSTRAINT "_StoryToHighlights_B_fkey" FOREIGN KEY ("B") REFERENCES "Story"("StoryID") ON DELETE CASCADE ON UPDATE CASCADE;
