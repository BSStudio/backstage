-- The site at bsstudio.hu is being replaced and both run in parallel, so "website" has to
-- name the new one. Renaming rather than recreating keeps the target on every sync job
-- already on record, and every member's Drupal uid.
ALTER TYPE "SyncTarget" RENAME VALUE 'WEBSITE' TO 'DRUPAL';

ALTER TABLE "Member" RENAME COLUMN "websiteUserId" TO "drupalUserId";

-- AlterEnum
ALTER TYPE "SyncTarget" ADD VALUE 'WEBSITE';

-- AlterEnum
ALTER TYPE "SyncOperation" ADD VALUE 'SYNC_MEMBER';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'WEBSITE_FULL_SYNC';
