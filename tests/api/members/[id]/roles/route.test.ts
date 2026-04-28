import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNoSession, mockSession } from "../../../../helpers";
import { getTestPrisma, mockPrisma } from "../../../../setup";

const ACTOR_ID = "test-actor-id";
const MEMBER_ID = "test-member-id";

beforeEach(async () => {
  vi.resetModules();
  mockPrisma();

  vi.doMock("@/lib/sync/authentik/orchestrators", () => ({
    createAuthentikUser: vi.fn(),
    orchestrateDeactivate: vi.fn(),
    orchestrateUpdateAttributes: vi.fn(),
    orchestrateStatusChange: vi.fn(async () => []),
    orchestrateAddToGroup: vi.fn(async () => ({
      success: true,
      result: null,
    })),
    orchestrateRemoveFromGroup: vi.fn(async () => ({
      success: true,
      result: null,
    })),
    buildAuthentikAttributes: (m: {
      firstName: string;
      lastName: string;
      mobile: string | null;
      avatarUrl: string | null;
    }) => ({
      first_name: m.firstName,
      last_name: m.lastName,
      ...(m.mobile ? { mobile: m.mobile } : {}),
      ...(m.avatarUrl ? { avatar_url: m.avatarUrl } : {}),
    }),
  }));

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
    new NextRequest(new URL(`/api/members/${id}/roles`, "http://localhost")),
    { params: Promise.resolve({ id }) },
  ] as const;
}

function putReq(id: string, body: Record<string, unknown>) {
  return [
    new NextRequest(new URL(`/api/members/${id}/roles`, "http://localhost"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    } as never),
    { params: Promise.resolve({ id }) },
  ] as const;
}

// ─── PUT /api/members/[id]/roles - auth + error mapping ────────────────────

describe("PUT /api/members/[id]/roles", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(
      ...putReq(MEMBER_ID, { label: "Főszerkesztő", authentikGroupIds: [] }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is a regular member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(
      ...putReq(MEMBER_ID, { label: "Főszerkesztő", authentikGroupIds: [] }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent member", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(
      ...putReq("non-existent", {
        label: "Főszerkesztő",
        authentikGroupIds: [],
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body (missing label)", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(...putReq(MEMBER_ID, { authentikGroupIds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty label", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(
      ...putReq(MEMBER_ID, { label: "", authentikGroupIds: [] }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful assignment", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(
      ...putReq(MEMBER_ID, {
        label: "Főszerkesztő",
        authentikGroupIds: [],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ assigned: true });
  });

  it("returns 207 with syncErrors when Authentik group add fails", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    vi.doMock("@/lib/sync/authentik/orchestrators", () => ({
      createAuthentikUser: vi.fn(),
      orchestrateDeactivate: vi.fn(),
      orchestrateUpdateAttributes: vi.fn(),
      orchestrateStatusChange: vi.fn(async () => []),
      orchestrateAddToGroup: vi.fn(async () => ({
        success: false,
        error: "add failed",
      })),
      orchestrateRemoveFromGroup: vi.fn(async () => ({
        success: true,
        result: null,
      })),
      buildAuthentikAttributes: () => ({}),
    }));
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(
      ...putReq(MEMBER_ID, {
        label: "Főszerkesztő",
        authentikGroupIds: ["group-1"],
      }),
    );
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body).toEqual({ assigned: true, syncErrors: ["add failed"] });
  });

  it("updates an existing role (upsert semantics)", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Főszerkesztő",
        authentikGroupIds: [],
      },
    });

    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PUT } = await import("@/app/api/members/[id]/roles/route");
    const res = await PUT(
      ...putReq(MEMBER_ID, {
        label: "PR-felelős",
        authentikGroupIds: [],
      }),
    );
    expect(res.status).toBe(200);

    const role = await prisma.leadershipRole.findUnique({
      where: { memberId: MEMBER_ID },
    });
    expect(role?.label).toBe("PR-felelős");
  });
});

// ─── DELETE /api/members/[id]/roles - auth + error mapping ──────────────────

describe("DELETE /api/members/[id]/roles", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { DELETE } = await import("@/app/api/members/[id]/roles/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is a regular member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { DELETE } = await import("@/app/api/members/[id]/roles/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent member", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { DELETE } = await import("@/app/api/members/[id]/roles/route");
    const res = await DELETE(...reqWithParams("non-existent"));
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful removal (no existing role is a no-op)", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { DELETE } = await import("@/app/api/members/[id]/roles/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ removed: true });
  });

  it("returns 207 with syncErrors when Authentik group remove fails", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Lead",
        authentikGroupIds: ["group-1"],
      },
    });
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    vi.doMock("@/lib/sync/authentik/orchestrators", () => ({
      createAuthentikUser: vi.fn(),
      orchestrateDeactivate: vi.fn(),
      orchestrateUpdateAttributes: vi.fn(),
      orchestrateStatusChange: vi.fn(async () => []),
      orchestrateAddToGroup: vi.fn(),
      orchestrateRemoveFromGroup: vi.fn(async () => ({
        success: false,
        error: "remove failed",
      })),
      buildAuthentikAttributes: () => ({}),
    }));
    const { DELETE } = await import("@/app/api/members/[id]/roles/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body).toEqual({ removed: true, syncErrors: ["remove failed"] });
  });
});
