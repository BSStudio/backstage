import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthentikError, authentikRequest } from "@/lib/authentik/client";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubEnv("AUTHENTIK_URL", "https://auth.example.com");
  vi.stubEnv("AUTHENTIK_API_TOKEN", "test-token");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("authentikRequest", () => {
  it("throws if AUTHENTIK_URL is missing", async () => {
    vi.stubEnv("AUTHENTIK_URL", "");
    await expect(authentikRequest("/core/users/")).rejects.toThrow(
      "Missing AUTHENTIK_URL or AUTHENTIK_API_TOKEN",
    );
  });

  it("throws if AUTHENTIK_API_TOKEN is missing", async () => {
    vi.stubEnv("AUTHENTIK_API_TOKEN", "");
    await expect(authentikRequest("/core/users/")).rejects.toThrow(
      "Missing AUTHENTIK_URL or AUTHENTIK_API_TOKEN",
    );
  });

  it("sends correct URL, headers, and bearer token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    });

    await authentikRequest("/core/users/?uuid=abc");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://auth.example.com/api/v3/core/users/?uuid=abc",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("strips trailing slash from base URL", async () => {
    vi.stubEnv("AUTHENTIK_URL", "https://auth.example.com/");
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await authentikRequest("/core/users/");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://auth.example.com/api/v3/core/users/",
      expect.anything(),
    );
  });

  it("parses JSON response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ pk: 1, username: "test" }),
    });

    const result = await authentikRequest("/core/users/1/");
    expect(result).toEqual({ pk: 1, username: "test" });
  });

  it("returns undefined for 204 responses", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    });

    const result = await authentikRequest("/core/groups/abc/add_user/", {
      method: "POST",
    });
    expect(result).toBeUndefined();
  });

  it("throws AuthentikError on non-ok response with detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: "Username already exists" }),
    });

    await expect(authentikRequest("/core/users/")).rejects.toThrow(
      AuthentikError,
    );
    await expect(authentikRequest("/core/users/")).rejects.toThrow(
      "Username already exists",
    );
  });

  it("throws AuthentikError with HTTP status when no detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
    });

    try {
      await authentikRequest("/core/users/");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthentikError);
      expect((e as AuthentikError).status).toBe(403);
      expect((e as AuthentikError).message).toContain("HTTP 403");
    }
  });

  it("handles non-JSON error responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
    });

    try {
      await authentikRequest("/core/users/");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthentikError);
      expect((e as AuthentikError).status).toBe(502);
      expect((e as AuthentikError).body).toBeNull();
    }
  });

  it("forwards custom request options", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await authentikRequest("/core/users/", {
      method: "POST",
      body: JSON.stringify({ username: "test" }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "test" }),
      }),
    );
  });
});
