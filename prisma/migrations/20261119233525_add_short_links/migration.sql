-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SHORT_LINK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SHORT_LINK_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SHORT_LINK_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'SHORT_LINK_FULL_SYNC';

-- CreateTable
CREATE TABLE "ShortLink" (
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("slug")
);
