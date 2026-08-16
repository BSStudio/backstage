import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// Emails and mobiles leak into error *strings*, not just into fields we control:
// Drupal echoes submitted form values back in its failure HTML. Tags are not
// scrubbed — those values are all ours, and PHONE_PATTERN would eat member ids.

export const REDACTED = "[redacted]";

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** International (`+36…`, `0036…`) and Hungarian trunk (`06…`) numbers. */
const PHONE_PATTERN =
  /(?:\+|00)\d[\d\s\-./()]{6,}\d|\b06[\s\-./]?\d{1,2}[\s\-./]?\d{3}[\s\-./]?\d{3,4}\b/g;

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "email",
  "mail",
  "mobile",
  "pass",
  "password",
  "payload",
  "phone",
  "pwd",
  "secret",
  "set-cookie",
  "tel",
  "token",
]);

/** Deeper than this is dropped rather than walked. */
const MAX_DEPTH = 6;

export function redactString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(PHONE_PATTERN, REDACTED);
}

export function redactPii(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTED;

  if (Array.isArray(value)) {
    return value.map((item) => redactPii(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redactPii(item, depth + 1),
    ]),
  );
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = redactString(breadcrumb.message);
  if (breadcrumb.data) {
    breadcrumb.data = redactPii(breadcrumb.data) as Record<string, unknown>;
  }
  return breadcrumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = redactString(event.message);

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactString(exception.value);
  }

  if (event.extra) {
    event.extra = redactPii(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = redactPii(event.contexts) as ErrorEvent["contexts"];
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  if (event.user) {
    event.user = { id: event.user.id, username: event.user.username };
  }

  // Drops headers, cookies and body along with everything else unlisted.
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url && redactString(event.request.url),
      query_string: redactPii(event.request.query_string) as never,
    };
  }

  return event;
}
