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

  // Actor: the logged-in user performing actions
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

  // Target member for GET/PATCH/DELETE tests
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

// ─── GET /api/members/[id] ───────────────────────────────────────────────────

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

  it("returns member with leadershipRole and timeline", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/[id]/route");
    const res = await GET(...reqWithParams(MEMBER_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: MEMBER_ID,
      firstName: "Target",
      lastName: "Member",
      email: "target@test.com",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      leadershipRole: null,
    });
    expect(body).toHaveProperty("timeline");
    expect(body.timeline).toEqual([]);
  });
});

// ─── PATCH /api/members/[id] ─────────────────────────────────────────────────

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

  it("allows member to edit themselves", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { nickname: "Self" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nickname).toBe("Self");

    const prisma = getTestPrisma();
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "MEMBER_UPDATED",
      actorId: MEMBER_ID,
      diff: { nickname: { old: null, new: "Self" } },
    });
  });

  it("allows leader to edit any member", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(
      ...patchReq(MEMBER_ID, { university: "BME", major: "VIK" }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.university).toBe("BME");
    expect(body.major).toBe("VIK");
  });

  it("allows admin to edit any member", async () => {
    mockSession({ id: ACTOR_ID, role: "ADMIN" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { nickname: "Admin Edit" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nickname).toBe("Admin Edit");
  });

  it("returns unchanged member when no fields differ", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { firstName: "Target" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.firstName).toBe("Target");

    // No audit log should be created for no-op
    const prisma = getTestPrisma();
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(0);
  });

  it("returns 400 for invalid data", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  // ─── Status changes ─────────────────────────────────────────────────────────

  it("returns 403 when member tries to change status", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(
      ...patchReq(MEMBER_ID, { status: "MEMBER_CANDIDATE" }),
    );
    expect(res.status).toBe(403);
  });

  it("allows leader to change status with timeline entry", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(
      ...patchReq(MEMBER_ID, { status: "MEMBER_CANDIDATE" }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("MEMBER_CANDIDATE");

    const prisma = getTestPrisma();

    // Timeline entry for status change
    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "STATUS_CHANGED",
      status: "MEMBER_CANDIDATE",
    });

    // Audit log with STATUS_CHANGED action
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "STATUS_CHANGED",
      actorId: ACTOR_ID,
      diff: {
        status: {
          old: "MEMBER_CANDIDATE_CANDIDATE",
          new: "MEMBER_CANDIDATE",
        },
      },
    });
  });

  it("allows admin to change status", async () => {
    mockSession({ id: ACTOR_ID, role: "ADMIN" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(...patchReq(MEMBER_ID, { status: "MEMBER" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("MEMBER");
  });

  it("creates separate audit entries for status change and field update", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(
      ...patchReq(MEMBER_ID, {
        status: "MEMBER_CANDIDATE",
        nickname: "Promoted",
      }),
    );

    expect(res.status).toBe(200);

    const prisma = getTestPrisma();
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
      orderBy: { createdAt: "asc" },
    });

    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      action: "STATUS_CHANGED",
      diff: {
        status: { old: "MEMBER_CANDIDATE_CANDIDATE", new: "MEMBER_CANDIDATE" },
      },
    });
    expect(audit[1]).toMatchObject({
      action: "MEMBER_UPDATED",
      diff: {
        nickname: { old: null, new: "Promoted" },
      },
    });
  });

  it("does not create timeline entry for non-status updates", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    await PATCH(...patchReq(MEMBER_ID, { nickname: "Updated" }));

    const prisma = getTestPrisma();
    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(0);
  });

  // ─── websiteUsername ────────────────────────────────────────────────────────

  it("strips websiteUsername when set by non-admin", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(
      ...patchReq(MEMBER_ID, {
        websiteUsername: "override",
        nickname: "Also Changed",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.websiteUsername).toBeNull();
    expect(body.nickname).toBe("Also Changed");
  });

  it("allows admin to set websiteUsername", async () => {
    mockSession({ id: ACTOR_ID, role: "ADMIN" });
    const { PATCH } = await import("@/app/api/members/[id]/route");
    const res = await PATCH(
      ...patchReq(MEMBER_ID, { websiteUsername: "custom" }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.websiteUsername).toBe("custom");

    const prisma = getTestPrisma();
    const member = await prisma.member.findUnique({
      where: { id: MEMBER_ID },
    });
    expect(member?.websiteUsername).toBe("custom");
  });
});

// ─── DELETE /api/members/[id] ────────────────────────────────────────────────

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

  it("archives member with timeline and audit log", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { DELETE } = await import("@/app/api/members/[id]/route");
    const res = await DELETE(...reqWithParams(MEMBER_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ archived: true });

    const prisma = getTestPrisma();

    const member = await prisma.member.findUnique({
      where: { id: MEMBER_ID },
    });
    expect(member?.archived).toBe(true);
    expect(member?.archivedAt).toBeDefined();

    // Timeline entry
    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].action).toBe("MEMBER_ARCHIVED");

    // Audit log
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "MEMBER_ARCHIVED",
      actorId: ACTOR_ID,
      diff: { archived: { old: false, new: true } },
    });
  });
});
