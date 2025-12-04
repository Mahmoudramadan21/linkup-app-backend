-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_WARNING';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'BANNED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "BanReason" TEXT,
ADD COLUMN     "IsBanned" BOOLEAN NOT NULL DEFAULT false;
