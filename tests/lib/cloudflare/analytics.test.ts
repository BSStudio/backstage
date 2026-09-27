import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsDataset,
  CLICK_WINDOW_DAYS,
  readShortLinkClicks,
} from "@/lib/cloudflare/analytics";

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct-1");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-1");
  vi.stubEnv("CLOUDFLARE_ANALYTICS_DATASET", "short_link_clicks");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analyticsDataset", () => {
  it("returns the configured dataset", () => {
    expect(analyticsDataset()).toBe("short_link_clicks");
  });

  it.each(["", "   "])("returns null when it is %p", (value) => {
    vi.stubEnv("CLOUDFLARE_ANALYTICS_DATASET", value);
    expect(analyticsDataset()).toBeNull();
  });

  it.each(["clicks; DROP TABLE x", "clicks-1", "clicks.a"])(
    "throws for %p rather than interpolating it into SQL",
    (value) => {
      vi.stubEnv("CLOUDFLARE_ANALYTICS_DATASET", value);
      expect(() => analyticsDataset()).toThrow(
        `Invalid CLOUDFLARE_ANALYTICS_DATASET: ${value}`,
      );
    },
  );
});

describe("readShortLinkClicks", () => {
  it("aggregates the sample interval per slug", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: [
          { slug: "promo", clicks: "12" },
          { slug: "gala", clicks: 3 },
        ],
      }),
    );

    expect(await readShortLinkClicks()).toEqual({ promo: 12, gala: 3 });
  });

  it("sums the sample interval rather than counting rows", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));

    await readShortLinkClicks();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-1/analytics_engine/sql",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer token-1" });
    expect(init.body).toContain("SUM(_sample_interval)");
    expect(init.body).not.toContain("COUNT(");
    expect(init.body).toContain("FROM short_link_clicks");
    expect(init.body).toContain(`INTERVAL '${CLICK_WINDOW_DAYS}' DAY`);
  });

  it("returns nothing and calls out to no one when no dataset is set", async () => {
    vi.stubEnv("CLOUDFLARE_ANALYTICS_DATASET", "");

    expect(await readShortLinkClicks()).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips rows with no slug and reads a missing count as zero", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ data: [{ clicks: "9" }, { slug: "gala" }] }),
    );

    expect(await readShortLinkClicks()).toEqual({ gala: 0 });
  });

  it("returns nothing when the response carries no rows", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));

    expect(await readShortLinkClicks()).toEqual({});
  });

  it("throws on a refusal so the caller can decide", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ errors: [{ message: "Unauthorized" }] }, 403),
    );

    await expect(readShortLinkClicks()).rejects.toThrow(
      "Cloudflare API error: Unauthorized",
    );
  });

  it("rejects a 200 that is not JSON", async () => {
    mockFetch.mockResolvedValue(new Response("<html>", { status: 200 }));

    await expect(readShortLinkClicks()).rejects.toThrow(
      "Cloudflare API error: Response was not JSON",
    );
  });

  it("reports a transport failure with status 0", async () => {
    const failure = new TypeError("fetch failed");
    failure.cause = new Error("getaddrinfo ENOTFOUND");
    mockFetch.mockRejectedValue(failure);

    await expect(readShortLinkClicks()).rejects.toMatchObject({
      name: "CloudflareError",
      status: 0,
      message: "Cloudflare API error: getaddrinfo ENOTFOUND",
    });
  });
});
