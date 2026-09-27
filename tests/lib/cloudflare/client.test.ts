import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CloudflareError,
  cloudflareAuth,
  cloudflareRequest,
  isCloudflareConfigured,
  kvNamespaceId,
} from "@/lib/cloudflare/client";

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(result: unknown = null) {
  return jsonResponse({ success: true, errors: [], result });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct-1");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-1");
  vi.stubEnv("CLOUDFLARE_KV_NAMESPACE_ID", "ns-1");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cloudflareAuth", () => {
  it("returns the account and token", () => {
    expect(cloudflareAuth()).toEqual({ accountId: "acct-1", token: "token-1" });
  });

  it.each(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"])(
    "throws when %s is missing",
    (variable) => {
      vi.stubEnv(variable, "");
      expect(() => cloudflareAuth()).toThrow(
        "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables",
      );
    },
  );
});

describe("kvNamespaceId", () => {
  it("returns the namespace", () => {
    expect(kvNamespaceId()).toBe("ns-1");
  });

  it("throws when it is missing", () => {
    vi.stubEnv("CLOUDFLARE_KV_NAMESPACE_ID", "");
    expect(() => kvNamespaceId()).toThrow(
      "Missing CLOUDFLARE_KV_NAMESPACE_ID environment variable",
    );
  });
});

describe("isCloudflareConfigured", () => {
  it("is true when all three are set", () => {
    expect(isCloudflareConfigured()).toBe(true);
  });

  it.each([
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_KV_NAMESPACE_ID",
  ])("is false when %s is missing", (variable) => {
    vi.stubEnv(variable, "");
    expect(isCloudflareConfigured()).toBe(false);
  });
});

describe("cloudflareRequest", () => {
  it("addresses the account and carries the bearer token", async () => {
    mockFetch.mockResolvedValue(ok({ ok: true }));

    const body = await cloudflareRequest<{ ok: boolean }>("/storage/kv", {
      method: "PUT",
      body: "[]",
    });

    expect(body.result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct-1/storage/kv",
      {
        method: "PUT",
        body: "[]",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-1",
        },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("passes result_info through for paging", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        result: [],
        result_info: { cursor: "c1" },
      }),
    );

    const body = await cloudflareRequest<unknown[]>("/keys");

    expect(body.result_info?.cursor).toBe("c1");
  });

  it("throws when credentials are missing, without calling out", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");

    await expect(cloudflareRequest("/keys")).rejects.toThrow(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("joins the errors array into the message", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          errors: [{ code: 10001, message: "Invalid namespace" }, "odd"],
        },
        400,
      ),
    );

    await expect(cloudflareRequest("/keys")).rejects.toThrow(
      "Cloudflare API error: Invalid namespace; odd",
    );
  });

  it("treats a 200 carrying success:false as a failure", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: false, errors: [{ message: "Refused" }] }),
    );

    await expect(cloudflareRequest("/keys")).rejects.toThrow(
      "Cloudflare API error: Refused",
    );
  });

  it("falls back to a message field", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: "Gone" }, 410));

    await expect(cloudflareRequest("/keys")).rejects.toThrow(
      "Cloudflare API error: Gone",
    );
  });

  it.each([
    ["an empty errors array", { success: false, errors: [] }],
    ["no recognisable field", { success: false }],
    ["a non-object body", "plain text"],
  ])("falls back to the status line for %s", async (_label, body) => {
    mockFetch.mockResolvedValue(jsonResponse(body, 503));

    await expect(cloudflareRequest("/keys")).rejects.toThrow(
      "Cloudflare API error: HTTP 503",
    );
  });

  it("rejects a 200 that is not JSON", async () => {
    mockFetch.mockResolvedValue(new Response("<html>", { status: 200 }));

    await expect(cloudflareRequest("/keys")).rejects.toThrow(
      "Cloudflare API error: Response was not JSON",
    );
  });

  it("reports a transport failure with status 0", async () => {
    const failure = new TypeError("fetch failed");
    failure.cause = new Error("connect ECONNREFUSED 10.0.0.1:443");
    mockFetch.mockRejectedValue(failure);

    await expect(cloudflareRequest("/keys")).rejects.toMatchObject({
      name: "CloudflareError",
      status: 0,
      message: "Cloudflare API error: connect ECONNREFUSED 10.0.0.1:443",
    });
  });

  it("reports a timeout by name", async () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    mockFetch.mockRejectedValue(timeout);

    await expect(cloudflareRequest("/keys")).rejects.toThrow(
      "Cloudflare API error: No answer within 15 seconds",
    );
  });

  it("is an Error subclass carrying the status and body", () => {
    const error = new CloudflareError(429, { message: "Too many" });
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(429);
    expect(error.body).toEqual({ message: "Too many" });
  });
});
