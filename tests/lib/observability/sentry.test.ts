import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { REDACTED } from "@/lib/observability/scrub";
import { isExpectedError, sentryInitOptions } from "@/lib/observability/sentry";

const envKeys = [
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
  "NEXT_PUBLIC_APP_VERSION",
] as const;

const original = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of envKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("isExpectedError", () => {
  it("recognises the typed service errors by name", () => {
    expect(isExpectedError(new NotFoundError())).toBe(true);
    expect(isExpectedError(new ForbiddenError())).toBe(true);
    expect(isExpectedError(new ValidationError({}))).toBe(true);
  });

  it("treats anything else as an incident", () => {
    expect(isExpectedError(new Error("Authentik 502"))).toBe(false);
    expect(isExpectedError("not an error")).toBe(false);
  });
});

describe("sentryInitOptions", () => {
  it("is disabled without a DSN", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const options = sentryInitOptions();

    expect(options.dsn).toBeUndefined();
    expect(options.enabled).toBe(false);
  });

  it("tags the release from the build version and never sends default PII", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://key@sentry.example/1";
    process.env.NEXT_PUBLIC_APP_VERSION = "v1.2.3-abc1234";
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = "production";

    const options = sentryInitOptions();

    expect(options.enabled).toBe(true);
    expect(options.release).toBe("v1.2.3-abc1234");
    expect(options.environment).toBe("production");
    expect(options.sendDefaultPii).toBe(false);
    // Not 0 — Sentry reads 0 as "tracing on, sample nothing".
    expect(options).not.toHaveProperty("tracesSampleRate");
  });

  it("falls back to NODE_ENV for the environment", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
    expect(sentryInitOptions().environment).toBe(process.env.NODE_ENV);
  });

  it("drops events for the typed service errors", () => {
    const { beforeSend } = sentryInitOptions();

    for (const type of ["NotFoundError", "ForbiddenError", "ValidationError"]) {
      const event = { exception: { values: [{ type }] } } as ErrorEvent;
      expect(beforeSend(event)).toBeNull();
    }
  });

  it("reads the thrown error, not its cause, when the chain is linked", () => {
    const { beforeSend } = sentryInitOptions();

    const wrapped = {
      exception: {
        values: [{ type: "NotFoundError" }, { type: "Error" }],
      },
    } as ErrorEvent;
    expect(beforeSend(wrapped)).not.toBeNull();

    const expected = {
      exception: {
        values: [{ type: "Error" }, { type: "NotFoundError" }],
      },
    } as ErrorEvent;
    expect(beforeSend(expected)).toBeNull();
  });

  it("scrubs the events it does send", () => {
    const { beforeSend } = sentryInitOptions();
    const event = {
      exception: { values: [{ type: "Error", value: "no such user a@b.co" }] },
    } as ErrorEvent;

    expect(beforeSend(event)).toMatchObject({
      exception: { values: [{ value: `no such user ${REDACTED}` }] },
    });
  });

  it("scrubs an event with no exception type", () => {
    const { beforeSend } = sentryInitOptions();
    expect(beforeSend({ message: "boom" } as ErrorEvent)).toEqual({
      message: "boom",
    });
  });
});
