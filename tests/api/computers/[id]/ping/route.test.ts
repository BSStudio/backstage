import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma, mockPrisma } from "../../../../setup";

const { mockRequireApiClient, mockLogger } = vi.hoisted(() => ({
  mockRequireApiClient: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const AGENT = { sub: "svc-nle4", username: "nle4-agent" };

const PING = {
  metadata: { os: "Windows 11 Pro", cpuPercent: 12, loggedInUser: null },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockPrisma();

  vi.doMock("@/lib/api-client-auth", () => ({
    requireApiClient: mockRequireApiClient,
  }));
  vi.doMock("@/lib/observability/logger", () => ({ logger: mockLogger }));

  mockRequireApiClient.mockResolvedValue(AGENT);
});

function req(body: unknown = PING, { raw = false } = {}) {
  return new NextRequest(
    new URL("/api/computers/nle4/ping", "http://localhost"),
    {
      method: "POST",
      body: raw ? (body as string) : JSON.stringify(body),
    },
  );
}

const params = (id = "nle4") => ({ params: Promise.resolve({ id }) });

async function importRoute() {
  return import("@/app/api/computers/[id]/ping/route");
}

describe("POST /api/computers/[id]/ping", () => {
  it("returns 401 when the bearer token is rejected", async () => {
    mockRequireApiClient.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const { POST } = await importRoute();

    expect((await POST(req(), params())).status).toBe(401);
    expect(await getTestPrisma().computer.count()).toBe(0);
  });

  it("returns 403 when the caller is not in the agent group", async () => {
    mockRequireApiClient.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const { POST } = await importRoute();

    expect((await POST(req(), params())).status).toBe(403);
  });

  it("demands the agent group rather than the API client group", async () => {
    const { POST } = await importRoute();
    await POST(req(), params());

    expect(mockRequireApiClient).toHaveBeenCalledWith(
      expect.anything(),
      "computerAgent",
    );
  });

  it("answers 201 and registers the machine on its first ping", async () => {
    const { POST } = await importRoute();
    const response = await POST(req(), params());

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "nle4" });
    expect(await getTestPrisma().computer.count()).toBe(1);
    expect(mockLogger.info).toHaveBeenCalledWith("computers.ping", {
      computerId: "nle4",
      sub: AGENT.sub,
      caller: AGENT.username,
      outcome: "registered",
    });
  });

  it("answers 200 on a later ping", async () => {
    const { POST } = await importRoute();
    await POST(req(), params());

    const response = await POST(req(), params());

    expect(response.status).toBe(200);
    expect(mockLogger.info).toHaveBeenLastCalledWith(
      "computers.ping",
      expect.objectContaining({ outcome: "ok" }),
    );
  });

  it("answers 400 for a body that is not JSON at all", async () => {
    const { POST } = await importRoute();
    const response = await POST(req("not json", { raw: true }), params());

    expect(response.status).toBe(400);
    expect(await getTestPrisma().computer.count()).toBe(0);
  });

  it("answers 400 for an id that is not a slug", async () => {
    const { POST } = await importRoute();

    expect((await POST(req(), params("NLE 4"))).status).toBe(400);
  });

  it("answers 403 when another agent already claimed the id", async () => {
    const { POST } = await importRoute();
    await POST(req(), params());

    mockRequireApiClient.mockResolvedValue({
      sub: "svc-nle6",
      username: "nle6-agent",
    });
    const response = await POST(req(), params());

    expect(response.status).toBe(403);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "computers.ping",
      expect.objectContaining({ outcome: "error" }),
    );
  });

  it("rate limits an agent pinging in a loop", async () => {
    const { POST } = await importRoute();

    for (let i = 0; i < 10; i++) await POST(req(), params());
    const response = await POST(req(), params());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "computers.ping",
      expect.objectContaining({ outcome: "rate_limited" }),
    );
  });
});
