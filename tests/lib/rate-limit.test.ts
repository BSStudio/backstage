import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("createRateLimiter", () => {
  it("allows requests up to the limit and blocks the rest", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(limiter.consume("svc").allowed).toBe(true);
    expect(limiter.consume("svc").allowed).toBe(true);
    expect(limiter.consume("svc").allowed).toBe(true);
    expect(limiter.consume("svc").allowed).toBe(false);
  });

  it("reports seconds until the window ends", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.consume("svc").retryAfterSeconds).toBe(60);
    vi.advanceTimersByTime(30_000);
    expect(limiter.consume("svc").retryAfterSeconds).toBe(30);
  });

  it("counts each key separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.consume("svc-a").allowed).toBe(true);
    expect(limiter.consume("svc-b").allowed).toBe(true);
    expect(limiter.consume("svc-a").allowed).toBe(false);
  });

  it("starts a fresh window after the old one expires", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.consume("svc").allowed).toBe(true);
    expect(limiter.consume("svc").allowed).toBe(false);

    vi.advanceTimersByTime(60_000);

    expect(limiter.consume("svc").allowed).toBe(true);
  });
});
