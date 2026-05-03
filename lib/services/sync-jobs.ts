import type { PrismaClient } from "@/app/generated/prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { executeSyncJob, type SyncResult } from "@/lib/sync/executor";
import type { Actor } from "./members";

export async function retrySyncJob(
  prisma: PrismaClient,
  jobId: string,
  actor: Actor,
): Promise<SyncResult> {
  if (actor.role !== "ADMIN") throw new ForbiddenError();

  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError();
  if (job.status !== "FAILED") {
    throw new ValidationError({ status: "Only FAILED jobs can be retried" });
  }

  return executeSyncJob(prisma, jobId);
}
