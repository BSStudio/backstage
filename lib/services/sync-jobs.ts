import type { PrismaClient } from "@/app/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  type Actor,
  ensureCanAdminister,
  ensureCanViewAdminArea,
} from "@/lib/permissions";
import { pageSlice, totalPages } from "@/lib/services/pagination";
import { executeSyncJob, type SyncResult } from "@/lib/sync/executor";

export async function listSyncJobs(
  prisma: PrismaClient,
  actor: Actor,
  { page }: { page: number },
) {
  ensureCanViewAdminArea(actor);

  const [total, jobs] = await Promise.all([
    prisma.syncJob.count(),
    prisma.syncJob.findMany({
      include: { member: true },
      orderBy: { createdAt: "desc" },
      ...pageSlice(page),
    }),
  ]);

  return { jobs, total, totalPages: totalPages(total) };
}

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
