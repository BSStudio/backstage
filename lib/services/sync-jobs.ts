import type { PrismaClient } from "@/app/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { type Actor, ensureCanAdminister } from "@/lib/permissions";
import { executeSyncJob, type SyncResult } from "@/lib/sync/executor";

export async function retrySyncJob(
  prisma: PrismaClient,
  jobId: string,
  actor: Actor,
): Promise<SyncResult> {
  ensureCanAdminister(actor);

  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError();
  if (job.status !== "FAILED") {
    throw new ValidationError({ status: "Only FAILED jobs can be retried" });
  }

  return executeSyncJob(prisma, jobId);
}
