/*
  Warnings:

  - The primary key for the `AuditLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `action` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `details` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `CreatedAt` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `UserID` on the `Report` table. All the data in the column will be lost.
  - Added the required column `Action` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `AdminID` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ReporterID` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_UserID_fkey";

-- AlterTable
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_pkey",
DROP COLUMN "action",
DROP COLUMN "details",
DROP COLUMN "id",
DROP COLUMN "userId",
ADD COLUMN     "Action" TEXT NOT NULL,
ADD COLUMN     "AdminID" INTEGER NOT NULL,
ADD COLUMN     "AuditLogID" SERIAL NOT NULL,
ADD COLUMN     "Details" TEXT,
ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("AuditLogID");

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "CreatedAt",
DROP COLUMN "UserID",
ADD COLUMN     "ReporterID" INTEGER NOT NULL,
ADD COLUMN     "Status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_AdminID_idx" ON "AuditLog"("AdminID");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Report_PostID_idx" ON "Report"("PostID");

-- CreateIndex
CREATE INDEX "Report_ReporterID_idx" ON "Report"("ReporterID");

-- CreateIndex
CREATE INDEX "Report_Status_idx" ON "Report"("Status");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_AdminID_fkey" FOREIGN KEY ("AdminID") REFERENCES "User"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_ReporterID_fkey" FOREIGN KEY ("ReporterID") REFERENCES "User"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;
