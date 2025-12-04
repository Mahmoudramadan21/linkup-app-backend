/*
  Warnings:

  - You are about to drop the column `adminId` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `isGroup` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Conversation` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_adminId_fkey";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "adminId",
DROP COLUMN "isGroup",
DROP COLUMN "title";
