import * as Sentry from "@sentry/nextjs";
import type { SyncOperation, SyncTarget } from "@/app/generated/prisma/client";
import { isExpectedError } from "./sentry";

export interface SyncJobFailureContext {
  jobId: string;
  memberId: string;
  target: SyncTarget;
  operation: SyncOperation;
  attempts: number;
}

/** The payload is deliberately not attached — it holds member emails and mobiles. */
export function captureSyncJobFailure(
  error: unknown,
  context: SyncJobFailureContext,
): void {
  Sentry.captureException(error, {
    level: "error",
    tags: {
      "sync.job_id": context.jobId,
      "sync.target": context.target,
      "sync.operation": context.operation,
      "member.id": context.memberId,
    },
    extra: { attempts: context.attempts },
  });
}

/** Typed service errors are control flow, not incidents — they are dropped here. */
export function captureServiceError(error: unknown): void {
  if (isExpectedError(error)) return;
  Sentry.captureException(error);
}
