import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNoSession, mockSession } from "../../../helpers";
import { getTestPrisma, mockPrisma } from "../../../setup";

const ACTOR_ID = "test-actor-id";
const MEMBER_ID = "test-member-id";

beforeEach(async () => {
  vi.resetModules();
  mockPrisma();

  const prisma = getTestPrisma();

  await prisma.member.upsert({
    where: { id: ACTOR_ID },
    update: {},
    create: {
      id: ACTOR_ID,
      firstName: "Leader",
      lastName: "Actor",
      email: "actor@test.com",
      joinedSemester: "2025/2026/1",
    },
  });

  await prisma.member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "Target",
      lastName: "Member",
      email: "target@test.com",
      joinedSemester: "2025/2026/1",
    },
  });
});

function reqWithParams(id: string) {
  return [
    new NextRequest(new URL(`/api/members/${id}`, "http://localhost")),
    { params: Promise.resolve({ id }) },
  ] as const;
}

function patchReq(id: string, body: Record<string, unknown>) {
  return [
    new NextRequest(new URL(`/api/members/${id}`, "http://localhost"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    } as never),
    { params: Promise.resolve({ id }) },
  ] as const;
}

// ─── GET /api/members/[id] - auth + error mapping ───────────────────────────

describe("GET /api/members/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { GET } = await import("@/app/api/members/[id]/route");
    const res = await GET(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/[id]/route");
    const res = await GET(...reqWithParams("non-existent-id"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/[id]/route");
    const res = await GET(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(MEMBER_ID);
  });
});

// ─── PATCH /api/members/[id] - auth + error mapping ─────────────────────────

describe("PATCH /api/members/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { firstName: "New" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent member", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq("non-existent", { firstName: "New" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when member tries to edit another member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { nickname: "Hacker" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid data", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful update", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { nickname: "Updated" }));
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/members/[id] - auth + error mapping ─────────────────────────

describe("DELETE /api/members/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { DELETE } = await import("@/app/api/members/[id]/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is a regular member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { DELETE } = await import("@/app/api/members/[id]/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent member", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { DELETE } = await import("@/app/api/members/[id]/route");
    const res = await DELETE(...reqWithParams("non-existent"));
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful archive", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { DELETE } = await import("@/app/api/members/[id]/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ archived: true });
  });
});
