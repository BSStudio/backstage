import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNoSession, mockSession } from "../../helpers";
import { getTestPrisma, mockPrisma } from "../../setup";

const ACTOR_ID = "test-actor-id";

beforeEach(async () => {
  vi.resetModules();
  mockPrisma();

  vi.doMock("@/lib/sync/authentik/orchestrators", () => ({
    createAuthentikUser: vi.fn(async (data) => ({
      pk: 1,
      uuid: `authentik-${data.email}`,
      username: data.email.split("@")[0],
      name: `${data.lastName} ${data.firstName}`,
      email: data.email,
      is_active: true,
      path: "users",
      attributes: {},
      groups: [],
    })),
    orchestrateDeactivate: vi.fn(async () => ({
      success: true,
      result: null,
    })),
    orchestrateUpdateAttributes: vi.fn(async () => ({
      success: true,
      result: null,
    })),
    orchestrateStatusChange: vi.fn(async () => []),
  }));

  const prisma = getTestPrisma();
  await prisma.member.upsert({
    where: { id: ACTOR_ID },
    update: {},
    create: {
      id: ACTOR_ID,
      firstName: "Test",
      lastName: "Actor",
      email: "actor@test.com",
      joinedSemester: "2025/2026/1",
      websiteUsername: "test.actor",
    },
  });
});

function req(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init as never);
}

function postReq(body: Record<string, unknown>) {
  return req("/api/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── GET /api/members - auth smoke tests ─────────────────────────────────────

describe("GET /api/members", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { GET } = await import("@/app/api/members/route");
    const res = await GET(req("/api/members"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with members when authenticated", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/route");
    const res = await GET(req("/api/members"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

// ─── POST /api/members - auth + error mapping smoke tests ────────────────────

describe("POST /api/members", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(
      postReq({ firstName: "A", lastName: "B", email: "a@b.com" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is a regular member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(
      postReq({ firstName: "A", lastName: "B", email: "a@b.com" }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid input", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(postReq({ firstName: "Only" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful creation", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(
      postReq({ firstName: "New", lastName: "Member", email: "new@test.com" }),
    );
    expect(res.status).toBe(201);
  });
});
