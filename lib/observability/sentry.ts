import type { BrowserOptions, ErrorEvent } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, scrubLog, scrubSpan } from "./scrub";

type SamplingContext = Parameters<
  NonNullable<BrowserOptions["tracesSampler"]>
>[0];

const TRACES_SAMPLE_RATE = 0.5;

/** The probes' health check and the agents' pings. */
const UNTRACED_PATHS = [
  /^\/api\/health\/?$/,
  /^\/api\/computers\/[^/]+\/ping\/?$/,
];

// Shared by all three runtimes, so no server-only imports: `instrumentation-client.ts`
// pulls this into the browser bundle.

/** Matched by `name`, not `instanceof`, to avoid a cycle with `lib/errors.ts`. */
export const EXPECTED_ERROR_NAMES = [
  "ForbiddenError",
  "NotFoundError",
  "ValidationError",
];

export function isExpectedError(error: unknown): boolean {
  return error instanceof Error && EXPECTED_ERROR_NAMES.includes(error.name);
}

export function tracesSampler({
  name,
  attributes,
  inheritOrSampleWith,
}: SamplingContext): number {
  const path = String(attributes?.["url.path"] ?? name.replace(/^[A-Z]+ /, ""));
  if (UNTRACED_PATHS.some((pattern) => pattern.test(path))) return 0;
  return inheritOrSampleWith(TRACES_SAMPLE_RATE);
}

export function sentryInitOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  return {
    dsn,
    // No DSN means no Sentry — dev machines and the test suite stay offline.
    enabled: Boolean(dsn),
    // The same string `next.config.ts` uploads source maps under.
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampler,
    beforeSendSpan: scrubSpan,

    // All of it is collected by default; `databaseQueryData` would put the values
    // Prisma binds on the query spans.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      databaseQueryData: false,
      // Matched as a substring: `/api/usernames/suggest` takes first and last name.
      urlQueryParams: { deny: ["name"] },
    },
    beforeSend(event: ErrorEvent) {
      // Causes are prepended, so the thrown error is the last value, not the first.
      const type = event.exception?.values?.at(-1)?.type;
      if (type && EXPECTED_ERROR_NAMES.includes(type)) return null;
      return scrubEvent(event);
    },
    beforeBreadcrumb: scrubBreadcrumb,
    // Only the server writes logs: `lib/observability/logger.ts` has no client callers.
    enableLogs: true,
    beforeSendLog: scrubLog,
  };
}
