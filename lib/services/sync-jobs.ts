import type { PrismaClient } from "@/app/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  type Actor,
  ensureCanAdminister,
  ensureCanViewAdminArea,
} from "@/lib/permissions";
import { executeSyncJob, type SyncResult } from "@/lib/sync/executor";

const PAGE_SIZE = 50;

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
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return { jobs, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
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
