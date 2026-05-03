-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('MEMBER_CANDIDATE_CANDIDATE', 'MEMBER_CANDIDATE', 'MEMBER', 'ACTIVE_ALUMNI', 'ALUMNI');

-- CreateEnum
CREATE TYPE "SyncTarget" AS ENUM ('AUTHENTIK', 'WEBSITE');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('CREATE_USER', 'UPDATE_USER', 'DEACTIVATE_USER', 'ADD_TO_GROUP', 'REMOVE_FROM_GROUP');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('MEMBER_CREATED', 'MEMBER_UPDATED', 'MEMBER_ARCHIVED', 'MEMBER_REACTIVATED', 'STATUS_CHANGED', 'ROLE_ASSIGNED', 'ROLE_CHANGED', 'ROLE_REMOVED', 'AVATAR_UPLOADED', 'AVATAR_REMOVED');

-- CreateEnum
CREATE TYPE "GoogleGroupMatchStatus" AS ENUM ('MATCHED', 'ARCHIVED_ON_LIST', 'SECONDARY_EMAIL', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nickname" TEXT,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "avatarUrl" TEXT,
    "portraitUrl" TEXT,
    "university" TEXT,
    "major" TEXT,
    "dormRoom" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'MEMBER_CANDIDATE_CANDIDATE',
    "joinedSemester" TEXT NOT NULL,
    "websiteUsername" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "authentikGroupIds" TEXT[],

    CONSTRAINT "LeadershipRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthentikGroup" (
    "authentikGroupId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,

    CONSTRAINT "AuthentikGroup_pkey" PRIMARY KEY ("authentikGroupId")
);

-- CreateTable
CREATE TABLE "TimelineEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "status" "MembershipStatus",
    "roleLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "target" "SyncTarget" NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "memberId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleGroupEntry" (
    "email" TEXT NOT NULL,
    "matchStatus" "GoogleGroupMatchStatus" NOT NULL DEFAULT 'UNKNOWN',
    "memberId" TEXT,
    "note" TEXT,

    CONSTRAINT "GoogleGroupEntry_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipRole_memberId_key" ON "LeadershipRole"("memberId");

-- AddForeignKey
ALTER TABLE "LeadershipRole" ADD CONSTRAINT "LeadershipRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleGroupEntry" ADD CONSTRAINT "GoogleGroupEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
