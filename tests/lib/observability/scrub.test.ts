import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import {
  REDACTED,
  redactPii,
  redactString,
  scrubBreadcrumb,
  scrubEvent,
} from "@/lib/observability/scrub";

describe("redactString", () => {
  it("redacts email addresses", () => {
    expect(redactString("failed for kovacs.janos@bsstudio.hu (409)")).toBe(
      `failed for ${REDACTED} (409)`,
    );
    expect(redactString("a@b.co and c.d+tag@sub.example.org")).toBe(
      `${REDACTED} and ${REDACTED}`,
    );
  });

  it("redacts international and Hungarian trunk phone numbers", () => {
    expect(redactString("+36 30 123 4567")).toBe(REDACTED);
    expect(redactString("+36301234567")).toBe(REDACTED);
    expect(redactString("0036 30 123 4567")).toBe(REDACTED);
    expect(redactString("mobile: 06 30 123 4567 unreachable")).toBe(
      `mobile: ${REDACTED} unreachable`,
    );
    expect(redactString("06-1-123-456")).toBe(REDACTED);
  });

  it("leaves ordinary text alone", () => {
    expect(redactString("Drupal returned 500 for uid 9001")).toBe(
      "Drupal returned 500 for uid 9001",
    );
    expect(redactString("2025/2026/1")).toBe("2025/2026/1");
  });
});

describe("redactPii", () => {
  it("passes non-string primitives through untouched", () => {
    expect(redactPii(42)).toBe(42);
    expect(redactPii(true)).toBe(true);
    expect(redactPii(null)).toBeNull();
    expect(redactPii(undefined)).toBeUndefined();
  });

  it("redacts strings anywhere in the structure", () => {
    expect(redactPii(["a@b.co", 1, ["+36301234567"]])).toEqual([
      REDACTED,
      1,
      [REDACTED],
    ]);
  });

  it("drops sensitive keys wholesale, whatever the value looks like", () => {
    expect(
      redactPii({
        username: "jkovacs",
        email: "jkovacs@bsstudio.hu",
        mobile: "30/123-4567",
        password: "hunter2",
        payload: { fullname: "Kovács János" },
      }),
    ).toEqual({
      username: "jkovacs",
      email: REDACTED,
      mobile: REDACTED,
      password: REDACTED,
      payload: REDACTED,
    });
  });

  it("matches sensitive keys case-insensitively", () => {
    expect(
      redactPii({ Authorization: "Bearer abc", "Set-Cookie": "s=1" }),
    ).toEqual({ Authorization: REDACTED, "Set-Cookie": REDACTED });
  });

  it("drops anything nested deeper than the walk limit", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: "a@b.co" } } } } } } };
    expect(redactPii(deep)).toEqual({
      a: { b: { c: { d: { e: { f: REDACTED } } } } },
    });
  });
});

describe("scrubBreadcrumb", () => {
  it("redacts the message and the data bag", () => {
    const crumb: Breadcrumb = {
      message: "POST as a@b.co",
      data: { email: "a@b.co", status: 500 },
    };
    expect(scrubBreadcrumb(crumb)).toEqual({
      message: `POST as ${REDACTED}`,
      data: { email: REDACTED, status: 500 },
    });
  });

  it("leaves a breadcrumb without message or data alone", () => {
    expect(scrubBreadcrumb({ category: "http" })).toEqual({ category: "http" });
  });
});

describe("scrubEvent", () => {
  it("redacts the message and every exception value", () => {
    const event = {
      message: "sync failed for a@b.co",
      exception: {
        values: [
          { type: "Error", value: "Drupal rejected +36301234567" },
          { type: "Error" },
        ],
      },
    } as ErrorEvent;

    expect(scrubEvent(event)).toMatchObject({
      message: `sync failed for ${REDACTED}`,
      exception: {
        values: [{ value: `Drupal rejected ${REDACTED}` }, { type: "Error" }],
      },
    });
  });

  it("tolerates an event with no message, exception values or optional bags", () => {
    expect(scrubEvent({ exception: {} } as ErrorEvent)).toEqual({
      exception: {},
    });
    expect(scrubEvent({} as ErrorEvent)).toEqual({});
  });

  it("redacts extra, contexts and breadcrumbs", () => {
    const event = {
      extra: { payload: { email: "a@b.co" }, attempts: 2 },
      contexts: { drupal: { form: "user-register", mail: "a@b.co" } },
      breadcrumbs: [{ message: "logged in as a@b.co" }],
    } as unknown as ErrorEvent;

    expect(scrubEvent(event)).toEqual({
      extra: { payload: REDACTED, attempts: 2 },
      contexts: { drupal: { form: "user-register", mail: REDACTED } },
      breadcrumbs: [{ message: `logged in as ${REDACTED}` }],
    });
  });

  it("keeps only the identifiers on the user object", () => {
    const event = {
      user: {
        id: "uuid-1",
        username: "jkovacs",
        email: "jkovacs@bsstudio.hu",
        ip_address: "10.0.0.1",
      },
    } as ErrorEvent;

    expect(scrubEvent(event).user).toEqual({
      id: "uuid-1",
      username: "jkovacs",
    });
  });

  it("strips headers, cookies and bodies off the request", () => {
    const event = {
      request: {
        method: "GET",
        url: "https://backstage/api/members?email=a@b.co",
        query_string: { email: "a@b.co" },
        headers: { authorization: "Bearer abc" },
        cookies: { session: "abc" },
        data: { mobile: "+36301234567" },
      },
    } as unknown as ErrorEvent;

    expect(scrubEvent(event).request).toEqual({
      method: "GET",
      url: `https://backstage/api/members?email=${REDACTED}`,
      query_string: { email: REDACTED },
    });
  });

  it("handles a request without a url", () => {
    const event = { request: { method: "POST" } } as ErrorEvent;
    expect(scrubEvent(event).request).toEqual({
      method: "POST",
      url: undefined,
      query_string: undefined,
    });
  });
});
