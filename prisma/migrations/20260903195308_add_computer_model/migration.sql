-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'COMPUTER_DELETED';

-- CreateTable
CREATE TABLE "Computer" (
    "id" TEXT NOT NULL,
    "agentSub" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Computer_pkey" PRIMARY KEY ("id")
);
