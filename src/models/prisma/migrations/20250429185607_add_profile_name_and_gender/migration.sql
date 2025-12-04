-- Create the Gender enum with MALE and FEMALE values
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- Add Gender and ProfileName columns as optional
ALTER TABLE "User" ADD COLUMN "Gender" "Gender";
ALTER TABLE "User" ADD COLUMN "ProfileName" TEXT;

-- Set default values for existing rows in Gender and ProfileName
UPDATE "User" SET "Gender" = 'MALE' WHERE "Gender" IS NULL;
UPDATE "User" SET "ProfileName" = 'Unknown' WHERE "ProfileName" IS NULL;

-- Make Gender and ProfileName required
ALTER TABLE "User" ALTER COLUMN "Gender" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "ProfileName" SET NOT NULL;

-- Set a default value for DateOfBirth where it is NULL
UPDATE "User" SET "DateOfBirth" = '1970-01-01' WHERE "DateOfBirth" IS NULL;

-- Make DateOfBirth required
ALTER TABLE "User" ALTER COLUMN "DateOfBirth" SET NOT NULL;