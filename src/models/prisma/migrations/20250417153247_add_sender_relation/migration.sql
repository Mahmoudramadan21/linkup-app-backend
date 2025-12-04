/*
  Warnings:
  - Changed the type of `Type` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
*/

-- Add a temporary column to store the new enum values
ALTER TABLE "Notification" ADD COLUMN "Type_temp" "NotificationType";

-- Migrate existing data to the new enum column
UPDATE "Notification" SET "Type_temp" = CASE
  WHEN "Type" = 'FOLLOW_REQUEST' THEN 'FOLLOW_REQUEST'::"NotificationType"
  WHEN "Type" = 'FOLLOW_ACCEPTED' THEN 'FOLLOW_ACCEPTED'::"NotificationType"
  WHEN "Type" = 'FOLLOW' THEN 'FOLLOW'::"NotificationType"
  WHEN "Type" = 'LIKE' THEN 'LIKE'::"NotificationType"
  WHEN "Type" = 'COMMENT' THEN 'COMMENT'::"NotificationType"
  WHEN "Type" = 'MESSAGE' THEN 'MESSAGE'::"NotificationType"
  WHEN "Type" = 'STORY_LIKE' THEN 'STORY_LIKE'::"NotificationType"
  WHEN "Type" = 'ADMIN_WARNING' THEN 'ADMIN_WARNING'::"NotificationType"
  ELSE NULL
END;

-- Drop the old Type column
ALTER TABLE "Notification" DROP COLUMN "Type";

-- Rename the temporary column to Type
ALTER TABLE "Notification" RENAME COLUMN "Type_temp" TO "Type";

-- Make the Type column NOT NULL
ALTER TABLE "Notification" ALTER COLUMN "Type" SET NOT NULL;