import type {
  PrismaClient,
  SyncOperation,
  SyncTarget,
} from "@/app/generated/prisma/client";
import { Prisma } from "@/app/generated/prisma/client";
import { authentikHandlers } from "./authentik/operations";

export type OperationHandler = (
  payload: Record<string, unknown>,
  memberId: string,
) => Promise<unknown>;

export type OperationHandlers = Partial<
  Record<SyncOperation, OperationHandler>
>;

const HANDLERS_BY_TARGET: Record<SyncTarget, OperationHandlers> = {
  AUTHENTIK: authentikHandlers,
  WEBSITE: {}, // stubbed — no operations implemented yet
};

export type SyncResult =
  | { success: true; result: unknown }
  | { success: false; error: string };

export async function executeSyncJob(
  prisma: PrismaClient,
  jobId: string,
): Promise<SyncResult> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`SyncJob not found: ${jobId}`);

  const handler = HANDLERS_BY_TARGET[job.target]?.[job.operation];
  /* v8 ignore next 5 -- defense in depth; orchestrators only create jobs for registered target/operation pairs */
  if (!handler) {
    throw new Error(`No handler registered for ${job.target}/${job.operation}`);
  }

  await prisma.syncJob.update({
    where: { id: jobId },
    data: { status: "IN_PROGRESS", attempts: { increment: 1 } },
  });

  try {
    const payload = job.payload as Record<string, unknown>;
    const result = await handler(payload, job.memberId);
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCESS",
        result: result == null ? Prisma.JsonNull : (result as object),
      },
    });
    return { success: true, result };
  } catch (error) {
    const message = (error as Error).message;
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "FAILED", result: { error: message } },
    });
    return { success: false, error: message };
  }
}
