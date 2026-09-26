import type { ErrorEvent } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

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

export function sentryInitOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  return {
    dsn,
    // No DSN means no Sentry — dev machines and the test suite stay offline.
    enabled: Boolean(dsn),
    release: process.env.NEXT_PUBLIC_APP_VERSION,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    // No `tracesSampleRate`: Sentry reads 0 as "tracing on, sample nothing",
    // which still builds spans and propagates trace headers.

    // All of it is collected by default. `databaseQueryData` reaches nothing while tracing
    // is off, and is pinned so turning tracing on cannot start sending bound values.
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
  };
}
