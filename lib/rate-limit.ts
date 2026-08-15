export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window ends — send as `Retry-After`. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string): RateLimitResult;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const windows = new Map<string, { count: number; expiresAt: number }>();

  return {
    consume(key: string): RateLimitResult {
      const now = Date.now();

      // Key count is bounded by the number of service accounts, so a full sweep
      // per call is cheaper than tracking expiry separately.
      for (const [existingKey, window] of windows) {
        if (window.expiresAt <= now) windows.delete(existingKey);
      }

      const window = windows.get(key) ?? {
        count: 0,
        expiresAt: now + options.windowMs,
      };
      window.count++;
      windows.set(key, window);

      return {
        allowed: window.count <= options.limit,
        retryAfterSeconds: Math.ceil((window.expiresAt - now) / 1000),
      };
    },
  };
}
