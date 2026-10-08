import type { PrismaClient } from "@/app/generated/prisma/client";
import { isEmailConfigured } from "@/lib/email/smtp";
import { NOT_CONFIGURED_REASON } from "@/lib/sync-jobs";
import { runSyncJob, type SyncResult } from "../executor";

// Skipped rather than failed when there is no relay: nothing to call, and no retry that
// could succeed until an admin configures one. The row is still written, so a deployment
// that was meant to send letters and does not is visible at /admin/sync-jobs.
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
