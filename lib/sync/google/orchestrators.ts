import type {
  PrismaClient,
  SyncOperation,
} from "@/app/generated/prisma/client";
import {
  getAlumniGroupEmail,
  getGroupEmail,
  isGoogleGroupConfigured,
} from "@/lib/google/client";
import { NO_GOOGLE_GROUP_CONFIG_REASON } from "@/lib/sync-jobs";
import { executeSyncJob, type SyncResult } from "../executor";

function mainGroupEmail(): string | null {
  return isGoogleGroupConfigured() ? getGroupEmail() : null;
}

// Skipped rather than failed: with no credentials there is nothing to call and no retry that
// could succeed. The row is still written, so a lost credential does not go unnoticed.
async function runGoogleGroupJob(
  prisma: PrismaClient,
  memberId: string,
  operation: SyncOperation,
  email: string,
  groupEmail: string | null,
): Promise<SyncResult> {
  const payload = { email, groupEmail };

  if (!isGoogleGroupConfigured() || !groupEmail) {
    await prisma.syncJob.create({
      data: {
        target: "GOOGLE_GROUP",
        operation,
        memberId,
        payload,
        status: "SKIPPED",
        result: { reason: NO_GOOGLE_GROUP_CONFIG_REASON },
      },
    });
    return { success: true, result: null };
  }

  const job = await prisma.syncJob.create({
    data: { target: "GOOGLE_GROUP", operation, memberId, payload },
  });
  return executeSyncJob(prisma, job.id);
}

export async function orchestrateAddToGoogleGroup(
  prisma: PrismaClient,
  memberId: string,
  email: string,
): Promise<SyncResult> {
  return runGoogleGroupJob(
    prisma,
    memberId,
    "ADD_TO_GROUP",
    email,
    mainGroupEmail(),
  );
}

export async function orchestrateAddToAlumniGroup(
  prisma: PrismaClient,
  memberId: string,
  email: string,
): Promise<SyncResult> {
  return runGoogleGroupJob(
    prisma,
    memberId,
    "ADD_TO_GROUP",
    email,
    getAlumniGroupEmail(),
  );
}

export async function orchestrateRemoveFromGoogleGroup(
  prisma: PrismaClient,
  memberId: string,
  email: string,
): Promise<SyncResult> {
  return runGoogleGroupJob(
    prisma,
    memberId,
    "REMOVE_FROM_GROUP",
    email,
    mainGroupEmail(),
  );
}
