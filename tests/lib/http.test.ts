import { describe, expect, it } from "vitest";
import {
  EXTERNAL_REQUEST_TIMEOUT_MS,
  requestTimeout,
  transportFailure,
} from "@/lib/http";

describe("requestTimeout", () => {
  it("hands out a signal that has not fired yet", () => {
    expect(requestTimeout().aborted).toBe(false);
  });
});

describe("transportFailure", () => {
  it("names the budget when the endpoint never answered", () => {
    const error = new Error("The operation was aborted");
    error.name = "TimeoutError";

    expect(transportFailure(error)).toBe(
      `No answer within ${EXTERNAL_REQUEST_TIMEOUT_MS / 1000} seconds`,
    );
  });

  it("reports the cause, since fetch itself only says 'fetch failed'", () => {
    const error = new TypeError("fetch failed");
    error.cause = new Error("getaddrinfo ENOTFOUND web.example.com");

    expect(transportFailure(error)).toBe(
      "getaddrinfo ENOTFOUND web.example.com",
    );
  });

  it("falls back to the error itself when there is no cause", () => {
    expect(transportFailure(new TypeError("fetch failed"))).toBe(
      "TypeError: fetch failed",
    );
  });
});
