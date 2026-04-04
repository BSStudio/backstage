import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNoSession, mockSession } from "../../helpers";
import { getTestPrisma, mockPrisma } from "../../setup";

const ACTOR_ID = "test-actor-id";

beforeEach(async () => {
  vi.resetModules();
  mockPrisma();

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

// ─── GET /api/members ─────────────────────────────────────────────────────────

describe("GET /api/members", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { GET } = await import("@/app/api/members/route");
    const res = await GET(req("/api/members"));
    expect(res.status).toBe(401);
  });

  it("returns members with expected shape and includes leadershipRole", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/route");
    const res = await GET(req("/api/members"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: ACTOR_ID,
      firstName: "Test",
      lastName: "Actor",
      email: "actor@test.com",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      websiteUsername: "test.actor",
      archived: false,
      leadershipRole: null,
    });
  });

  it("orders by status then lastName", async () => {
    const prisma = getTestPrisma();
    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        firstName: "Gábor",
        lastName: "Szabó",
        email: "szabo@test.com",
        joinedSemester: "2025/2026/1",
        status: "MEMBER_CANDIDATE_CANDIDATE",
      },
    });
    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        firstName: "Péter",
        lastName: "Bálint",
        email: "balint@test.com",
        joinedSemester: "2025/2026/1",
        status: "MEMBER",
      },
    });

    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/route");
    const res = await GET(req("/api/members"));
    const body = await res.json();

    expect(body).toHaveLength(3);
    expect(body[0].lastName).toBe("Actor");
    expect(body[1].lastName).toBe("Szabó");
    expect(body[2].lastName).toBe("Bálint");
  });

  it("excludes archived members by default", async () => {
    const prisma = getTestPrisma();
    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        firstName: "Archived",
        lastName: "User",
        email: "archived@test.com",
        joinedSemester: "2025/2026/1",
        archived: true,
        archivedAt: new Date(),
      },
    });

    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/route");
    const res = await GET(req("/api/members"));
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].firstName).toBe("Test");
  });

  it("includes archived members when ?archived=true", async () => {
    const prisma = getTestPrisma();
    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        firstName: "Archived",
        lastName: "User",
        email: "archived@test.com",
        joinedSemester: "2025/2026/1",
        archived: true,
        archivedAt: new Date(),
      },
    });

    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { GET } = await import("@/app/api/members/route");
    const res = await GET(req("/api/members?archived=true"));
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body.some((m: { archived: boolean }) => m.archived)).toBe(true);
  });
});

// ─── POST /api/members ────────────────────────────────────────────────────────

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

  it("creates a member with correct defaults and side effects", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(
      postReq({
        firstName: "New",
        lastName: "Member",
        email: "new@test.com",
        nickname: "Newbie",
        mobile: "+36301234567",
        university: "BME",
        major: "CS",
        dormRoom: "B101",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);

    expect(body).toMatchObject({
      firstName: "New",
      lastName: "Member",
      email: "new@test.com",
      nickname: "Newbie",
      mobile: "+36301234567",
      university: "BME",
      major: "CS",
      dormRoom: "B101",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      archived: false,
      websiteUsername: null,
    });

    const { currentSemester } = await import("@/types");
    expect(body.joinedSemester).toBe(currentSemester());

    // Verify timeline entry
    const prisma = getTestPrisma();
    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: body.id },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "MEMBER_CREATED",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      memberId: body.id,
    });

    // Verify audit log
    const audit = await prisma.auditLog.findMany({
      where: { targetId: body.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "MEMBER_CREATED",
      actorId: ACTOR_ID,
      targetId: body.id,
    });
  });

  it("returns 400 for missing required fields", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(postReq({ firstName: "Only" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for invalid email", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(
      postReq({ firstName: "A", lastName: "B", email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty firstName", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(
      postReq({ firstName: "", lastName: "B", email: "a@b.com" }),
    );
    expect(res.status).toBe(400);
  });

  it("ignores unknown fields in request body", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    const { POST } = await import("@/app/api/members/route");
    const res = await POST(
      postReq({
        firstName: "Test",
        lastName: "User",
        email: "extra@test.com",
        unknownField: "should be ignored",
        anotherOne: 123,
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).not.toHaveProperty("unknownField");
    expect(body).not.toHaveProperty("anotherOne");
  });
});
