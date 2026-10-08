import type { PrismaClient } from "@/app/generated/prisma/client";
import { isEmailConfigured } from "@/lib/email/smtp";
import { NOT_CONFIGURED_REASON } from "@/lib/sync-jobs";
import { runSyncJob, type SyncResult } from "../executor";

// Skipped rather than failed: with no relay there is nothing to call and no retry that
// could succeed. The row is still written, so an instance that cannot send is visible.
export async function orchestrateSendWelcomeEmail(
  prisma: PrismaClient,
  memberId: string,
  username: string,
): Promise<SyncResult> {
  return runSyncJob(
    prisma,
    {
      target: "EMAIL",
      operation: "SEND_WELCOME_EMAIL",
      memberId,
      payload: { username },
    },
    isEmailConfigured() ? undefined : NOT_CONFIGURED_REASON,
  );
}
