import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { isExpectedError } from "@/lib/observability/sentry";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Render errors and rethrowing Server Actions. Routes never reach here —
// `mapServiceError` reports those.
export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context,
) => {
  if (isExpectedError(err)) return;
  return Sentry.captureRequestError(err, request, context);
};
