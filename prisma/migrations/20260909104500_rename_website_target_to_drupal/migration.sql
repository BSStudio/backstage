-- Renames rather than recreates, so the sync jobs already on record keep their target
-- and no member loses their Drupal uid. The new website takes over the WEBSITE name.
ALTER TYPE "SyncTarget" RENAME VALUE 'WEBSITE' TO 'DRUPAL';

ALTER TABLE "Member" RENAME COLUMN "websiteUserId" TO "drupalUserId";
