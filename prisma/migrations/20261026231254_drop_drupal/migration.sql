-- The enum value cannot be dropped while rows still hold it.
BEGIN;
DELETE FROM "SyncJob" WHERE "target" = 'DRUPAL';

CREATE TYPE "SyncTarget_new" AS ENUM ('AUTHENTIK', 'WEBSITE', 'GOOGLE_GROUP');
ALTER TABLE "SyncJob" ALTER COLUMN "target" TYPE "SyncTarget_new" USING ("target"::text::"SyncTarget_new");
ALTER TYPE "SyncTarget" RENAME TO "SyncTarget_old";
ALTER TYPE "SyncTarget_new" RENAME TO "SyncTarget";
DROP TYPE "SyncTarget_old";

ALTER TABLE "Member" DROP COLUMN "drupalUserId";
COMMIT;
