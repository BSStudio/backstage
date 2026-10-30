import type {
  PrismaClient,
  SyncOperation,
} from "@/app/generated/prisma/client";
import { isActiveDirectoryConfigured } from "@/lib/active-directory/config";
import {
  NO_AUTHENTIK_ACCOUNT_REASON,
  NOT_CONFIGURED_REASON,
} from "@/lib/sync-jobs";
import { hasAuthentikAccount } from "@/types";
import { runSyncJob, type SyncResult } from "../executor";

// The missing account is named first: configuring AD would not make that job runnable.
function skipReason(memberId: string): string | undefined {
  if (!hasAuthentikAccount(memberId)) return NO_AUTHENTIK_ACCOUNT_REASON;
  if (!isActiveDirectoryConfigured()) return NOT_CONFIGURED_REASON;
  return undefined;
}

async function runActiveDirectoryJob(
  prisma: PrismaClient,
  memberId: string,
  operation: SyncOperation,
  payload: object,
): Promise<SyncResult> {
  return runSyncJob(
    prisma,
    { target: "ACTIVE_DIRECTORY", operation, memberId, payload },
    skipReason(memberId),
  );
}

export async function orchestrateCreateActiveDirectoryUser(
  prisma: PrismaClient,
  memberId: string,
  username: string,
): Promise<SyncResult> {
  return runActiveDirectoryJob(prisma, memberId, "CREATE_USER", { username });
}

export async function orchestrateSyncActiveDirectoryUser(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runActiveDirectoryJob(prisma, memberId, "SYNC_MEMBER", {});
}
