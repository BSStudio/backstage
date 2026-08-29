-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CARDDAV_TOKEN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARDDAV_TOKEN_REVOKED';

-- CreateTable
CREATE TABLE "CardDAVToken" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "CardDAVToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardDAVToken_tokenHash_key" ON "CardDAVToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CardDAVToken_memberId_idx" ON "CardDAVToken"("memberId");

-- AddForeignKey
ALTER TABLE "CardDAVToken" ADD CONSTRAINT "CardDAVToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

