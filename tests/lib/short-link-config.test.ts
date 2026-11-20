import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortLinkBaseUrl } from "@/lib/short-link-config";

beforeEach(() => {
  vi.stubEnv("SHORT_LINK_BASE_URL", "https://bsstudio.hu/s");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shortLinkBaseUrl", () => {
  it("returns the configured base", () => {
    expect(shortLinkBaseUrl()).toBe("https://bsstudio.hu/s");
  });

  it("drops a trailing slash so the join does not double it", () => {
    vi.stubEnv("SHORT_LINK_BASE_URL", "https://bsstudio.hu/s//");
    expect(shortLinkBaseUrl()).toBe("https://bsstudio.hu/s");
  });

  it.each(["", "   "])("returns null when it is %p", (value) => {
    vi.stubEnv("SHORT_LINK_BASE_URL", value);
    expect(shortLinkBaseUrl()).toBeNull();
  });
});
