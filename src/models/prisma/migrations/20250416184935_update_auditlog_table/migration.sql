-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_AdminID_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "UserID" INTEGER,
ALTER COLUMN "AdminID" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_UserID_idx" ON "AuditLog"("UserID");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_AdminID_fkey" FOREIGN KEY ("AdminID") REFERENCES "User"("UserID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "User"("UserID") ON DELETE SET NULL ON UPDATE CASCADE;
