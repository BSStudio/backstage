import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/observability/logger";

const streams = {
  log: vi.spyOn(console, "log").mockImplementation(() => {}),
  warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
  error: vi.spyOn(console, "error").mockImplementation(() => {}),
};

// Not mocked: the tests run with Sentry uninitialised, so these call the real no-ops.
const sentry = {
  info: vi.spyOn(Sentry.logger, "info"),
  warn: vi.spyOn(Sentry.logger, "warn"),
  error: vi.spyOn(Sentry.logger, "error"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function lastLine(stream: keyof typeof streams) {
  return JSON.parse(streams[stream].mock.calls.at(-1)?.[0] as string);
}

describe("logger", () => {
  it("writes one JSON object per line, with the level and a timestamp", () => {
    logger.info("usernames.suggest", { sub: "svc-1", outcome: "ok" });

    expect(streams.log).toHaveBeenCalledTimes(1);
    expect(lastLine("log")).toMatchObject({
      level: "info",
      event: "usernames.suggest",
      sub: "svc-1",
      outcome: "ok",
    });
    expect(Date.parse(lastLine("log").time)).not.toBeNaN();
  });

  it("routes warn to console.warn and error to console.error", () => {
    logger.warn("usernames.suggest", { outcome: "rate_limited" });
    logger.error("usernames.suggest", { outcome: "error" });

    expect(lastLine("warn")).toMatchObject({
      level: "warn",
      outcome: "rate_limited",
    });
    expect(lastLine("error")).toMatchObject({
      level: "error",
      outcome: "error",
    });
  });

  it("accepts an event with no fields", () => {
    logger.info("boot");
    expect(lastLine("log")).toMatchObject({ level: "info", event: "boot" });
  });

  it("forwards each line to Sentry's logger at the same level", () => {
    logger.info("usernames.suggest", { sub: "svc-1", outcome: "ok" });
    logger.warn("computers.ping", { outcome: "rate_limited" });
    logger.error("calendar_read_failed");

    expect(sentry.info).toHaveBeenCalledWith("usernames.suggest", {
      sub: "svc-1",
      outcome: "ok",
    });
    expect(sentry.warn).toHaveBeenCalledWith("computers.ping", {
      outcome: "rate_limited",
    });
    expect(sentry.error).toHaveBeenCalledWith("calendar_read_failed", {});
    expect(streams.error).toHaveBeenCalledTimes(1);
  });
});
