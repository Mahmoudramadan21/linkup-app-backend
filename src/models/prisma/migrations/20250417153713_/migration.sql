-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "SenderID" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "NotificationPreferences" JSONB;

-- CreateIndex
CREATE INDEX "Notification_CreatedAt_idx" ON "Notification"("CreatedAt");

-- CreateIndex
CREATE INDEX "Notification_UserID_CreatedAt_idx" ON "Notification"("UserID", "CreatedAt");

-- CreateIndex
CREATE INDEX "User_Username_idx" ON "User"("Username");

-- CreateIndex
CREATE INDEX "User_Email_idx" ON "User"("Email");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_SenderID_fkey" FOREIGN KEY ("SenderID") REFERENCES "User"("UserID") ON DELETE SET NULL ON UPDATE CASCADE;
