-- The FK was created when targetId was still NOT NULL, and add_google_group_sync
-- dropped that without regenerating it. Postgres therefore still refused to delete a
-- member the audit log points at, while the schema has said SetNull ever since.

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_targetId_fkey";

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
