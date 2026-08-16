import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireApiClient, mockSuggestUsername, mockLogger } = vi.hoisted(
  () => ({
    mockRequireApiClient: vi.fn(),
    mockSuggestUsername: vi.fn(),
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }),
);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  vi.doMock("@/lib/api-client-auth", () => ({
    requireApiClient: mockRequireApiClient,
  }));
  vi.doMock("@/lib/services/usernames", () => ({
    suggestUsername: mockSuggestUsername,
  }));
  vi.doMock("@/lib/observability/logger", () => ({ logger: mockLogger }));

  mockRequireApiClient.mockResolvedValue({
    sub: "svc-1",
    username: "requests",
  });
  mockSuggestUsername.mockResolvedValue("jkovacs");
});

function req(query = "?firstName=J%C3%A1nos&lastName=Kov%C3%A1cs") {
  return new NextRequest(
    new URL(`/api/usernames/suggest${query}`, "http://localhost"),
  );
}

async function importRoute() {
  return import("@/app/api/usernames/suggest/route");
}

describe("GET /api/usernames/suggest", () => {
  it("returns 401 when the bearer token is rejected", async () => {
    mockRequireApiClient.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const { GET } = await importRoute();
    expect((await GET(req())).status).toBe(401);
    expect(mockSuggestUsername).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not in the API client group", async () => {
    mockRequireApiClient.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const { GET } = await importRoute();
    expect((await GET(req())).status).toBe(403);
  });

  it("returns 400 when a name parameter is missing", async () => {
    const { GET } = await importRoute();

    expect((await GET(req("?firstName=János"))).status).toBe(400);
    expect((await GET(req("?lastName=Kovács"))).status).toBe(400);
    expect((await GET(req("?firstName=+&lastName=Kovács"))).status).toBe(400);
    expect(mockSuggestUsername).not.toHaveBeenCalled();
  });

  it("returns only the username", async () => {
    mockSuggestUsername.mockResolvedValue("jkovacs2");

    const { GET } = await importRoute();
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "jkovacs2" });
    expect(mockSuggestUsername).toHaveBeenCalledWith("János", "Kovács");
  });

  it("rate limits per caller and sets Retry-After", async () => {
    const { GET } = await importRoute();

    for (let i = 0; i < 30; i++) {
      expect((await GET(req())).status).toBe(200);
    }

    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);

    // A different service account still gets through
    mockRequireApiClient.mockResolvedValue({ sub: "svc-2", username: "other" });
    expect((await GET(req())).status).toBe(200);
  });

  it("maps an Authentik failure to a 500", async () => {
    mockSuggestUsername.mockRejectedValue(new Error("Authentik API error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await importRoute();
    expect((await GET(req())).status).toBe(500);
  });
});

describe("GET /api/usernames/suggest — caller identity logging", () => {
  it("logs the service account on a successful suggestion", async () => {
    const { GET } = await importRoute();
    await GET(req());

    expect(mockLogger.info).toHaveBeenCalledWith("usernames.suggest", {
      sub: "svc-1",
      caller: "requests",
      outcome: "ok",
      username: "jkovacs",
    });
  });

  it("logs an invalid request", async () => {
    const { GET } = await importRoute();
    await GET(req("?firstName=János"));

    expect(mockLogger.warn).toHaveBeenCalledWith("usernames.suggest", {
      sub: "svc-1",
      caller: "requests",
      outcome: "invalid_request",
    });
  });

  it("logs which service account tripped the rate limit", async () => {
    const { GET } = await importRoute();
    for (let i = 0; i < 31; i++) await GET(req());

    expect(mockLogger.warn).toHaveBeenCalledWith("usernames.suggest", {
      sub: "svc-1",
      caller: "requests",
      outcome: "rate_limited",
    });
  });

  it("logs the failure message when Authentik is down", async () => {
    mockSuggestUsername.mockRejectedValue(new Error("Authentik API error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await importRoute();
    await GET(req());

    expect(mockLogger.error).toHaveBeenCalledWith("usernames.suggest", {
      sub: "svc-1",
      caller: "requests",
      outcome: "error",
      message: "Authentik API error",
    });
  });
});
