import type { PrismaClient } from "@/app/generated/prisma/client";
import { NOT_CONFIGURED_REASON } from "@/lib/sync-jobs";
import { isWebsiteWebhookConfigured } from "@/lib/website/webhook";
import { runSyncJob, type SyncResult } from "../executor";

export async function orchestrateSyncWebsiteMember(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runSyncJob(
    prisma,
    { target: "WEBSITE", operation: "SYNC_MEMBER", memberId, payload: {} },
    isWebsiteWebhookConfigured() ? undefined : NOT_CONFIGURED_REASON,
  );
}
