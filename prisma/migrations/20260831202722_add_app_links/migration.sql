-- CreateEnum
CREATE TYPE "AppLinkAccent" AS ENUM ('BLUE', 'TEAL', 'GREEN', 'AMBER', 'ORANGE', 'RED', 'VIOLET', 'PINK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'APP_LINK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'APP_LINK_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'APP_LINK_DELETED';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "targetLabel" TEXT;

-- CreateTable
CREATE TABLE "AppLink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "accent" "AppLinkAccent" NOT NULL DEFAULT 'BLUE',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppLink_pkey" PRIMARY KEY ("id")
);
