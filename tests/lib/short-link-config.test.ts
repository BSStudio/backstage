import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortLinkBaseUrl, shortLinkHost } from "@/lib/short-link-config";

beforeEach(() => {
  vi.stubEnv("SHORT_LINK_BASE_URL", "https://l.example.hu");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shortLinkBaseUrl", () => {
  it("returns the configured base", () => {
    expect(shortLinkBaseUrl()).toBe("https://l.example.hu");
  });

  it("drops a trailing slash so the join does not double it", () => {
    vi.stubEnv("SHORT_LINK_BASE_URL", "https://l.example.hu//");
    expect(shortLinkBaseUrl()).toBe("https://l.example.hu");
  });

  it.each(["", "   "])("returns null when it is %p", (value) => {
    vi.stubEnv("SHORT_LINK_BASE_URL", value);
    expect(shortLinkBaseUrl()).toBeNull();
  });
});

describe("shortLinkHost", () => {
  it("returns the host, lowercased", () => {
    vi.stubEnv("SHORT_LINK_BASE_URL", "https://L.Example.HU");
    expect(shortLinkHost()).toBe("l.example.hu");
  });

  it("returns null when no base is set", () => {
    vi.stubEnv("SHORT_LINK_BASE_URL", "");
    expect(shortLinkHost()).toBeNull();
  });

  it("returns null rather than throwing on an unparseable base", () => {
    vi.stubEnv("SHORT_LINK_BASE_URL", "not a url");
    expect(shortLinkHost()).toBeNull();
  });
});
