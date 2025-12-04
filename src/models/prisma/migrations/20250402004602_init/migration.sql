-- CreateTable
CREATE TABLE "RateLimiting" (
    "key" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "expire" INTEGER,

    CONSTRAINT "RateLimiting_pkey" PRIMARY KEY ("key")
);
