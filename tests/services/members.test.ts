import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/services/members";
import {
  archiveMember,
  batchArchive,
  batchUpdateStatus,
  createMember,
  getMember,
  listMembers,
  updateMember,
} from "@/lib/services/members";
import { getTestPrisma } from "../setup";

const ACTOR: Actor = { id: "test-actor-id", role: "LEADER" };
const ADMIN_ACTOR: Actor = { id: "test-actor-id", role: "ADMIN" };
const MEMBER_ACTOR: Actor = { id: "test-member-id", role: "MEMBER" };

const MEMBER_ID = "test-member-id";

beforeEach(async () => {
  const prisma = getTestPrisma();

  // Actor record (needed for audit log FK)
  await prisma.member.upsert({
    where: { id: ACTOR.id },
    update: {},
    create: {
      id: ACTOR.id,
      firstName: "Leader",
      lastName: "Actor",
      email: "actor@test.com",
      joinedSemester: "2025/2026/1",
    },
  });

  // Target member for get/update/archive tests
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

// ─── listMembers ─────────────────────────────────────────────────────────────

describe("listMembers", () => {
  it("returns non-archived members with leadershipRole by default", async () => {
    const prisma = getTestPrisma();
    const result = await listMembers(prisma);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("leadershipRole");
  });

  it("orders by status then lastName", async () => {
    const prisma = getTestPrisma();
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

    const result = await listMembers(prisma);

    expect(result).toHaveLength(3);
    // MEMBER_CANDIDATE_CANDIDATE sorts before MEMBER
    expect(result[0].lastName).toBe("Actor");
    expect(result[1].lastName).toBe("Member");
    expect(result[2].lastName).toBe("Bálint");
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

    const result = await listMembers(prisma);
    expect(result).toHaveLength(2);
  });

  it("includes archived members when requested", async () => {
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

    const result = await listMembers(prisma, { includeArchived: true });
    expect(result).toHaveLength(3);
    expect(result.some((m) => m.archived)).toBe(true);
  });
});

// ─── getMember ───────────────────────────────────────────────────────────────

describe("getMember", () => {
  it("returns member with leadershipRole and timeline", async () => {
    const prisma = getTestPrisma();
    const member = await getMember(prisma, MEMBER_ID);

    expect(member).toMatchObject({
      id: MEMBER_ID,
      firstName: "Target",
      leadershipRole: null,
    });
    expect(member.timeline).toEqual([]);
  });

  it("throws NotFoundError for non-existent member", async () => {
    const prisma = getTestPrisma();
    await expect(getMember(prisma, "non-existent")).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ─── createMember ────────────────────────────────────────────────────────────

describe("createMember", () => {
  it("creates a member with correct defaults and side effects", async () => {
    const prisma = getTestPrisma();
    const { currentSemester } = await import("@/types");

    const member = await createMember(
      prisma,
      {
        firstName: "New",
        lastName: "Member",
        email: "new@test.com",
        nickname: "Newbie",
        mobile: "+36301234567",
        university: "BME",
        major: "CS",
        dormRoom: "B101",
      },
      ACTOR,
    );

    expect(member).toMatchObject({
      firstName: "New",
      lastName: "Member",
      email: "new@test.com",
      nickname: "Newbie",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      archived: false,
      websiteUsername: null,
    });
    expect(member.joinedSemester).toBe(currentSemester());

    // Timeline entry
    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: member.id },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "MEMBER_CREATED",
      status: "MEMBER_CANDIDATE_CANDIDATE",
    });

    // Audit log
    const audit = await prisma.auditLog.findMany({
      where: { targetId: member.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "MEMBER_CREATED",
      actorId: ACTOR.id,
    });
  });

  it("throws ValidationError for missing required fields", async () => {
    const prisma = getTestPrisma();
    await expect(
      createMember(prisma, { firstName: "Only" }, ACTOR),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid email", async () => {
    const prisma = getTestPrisma();
    await expect(
      createMember(
        prisma,
        { firstName: "A", lastName: "B", email: "not-an-email" },
        ACTOR,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for empty firstName", async () => {
    const prisma = getTestPrisma();
    await expect(
      createMember(
        prisma,
        { firstName: "", lastName: "B", email: "a@b.com" },
        ACTOR,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("ignores unknown fields in input", async () => {
    const prisma = getTestPrisma();
    const member = await createMember(
      prisma,
      {
        firstName: "Test",
        lastName: "User",
        email: "extra@test.com",
        unknownField: "should be ignored",
      },
      ACTOR,
    );

    expect(member).not.toHaveProperty("unknownField");
  });
});

// ─── updateMember ────────────────────────────────────────────────────────────

describe("updateMember", () => {
  it("throws NotFoundError for non-existent member", async () => {
    const prisma = getTestPrisma();
    await expect(
      updateMember(prisma, "non-existent", { firstName: "New" }, ACTOR),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ForbiddenError when member tries to edit another member", async () => {
    const prisma = getTestPrisma();
    await expect(
      updateMember(
        prisma,
        MEMBER_ID,
        { nickname: "Hacker" },
        {
          ...MEMBER_ACTOR,
          id: ACTOR.id,
          role: "MEMBER",
        },
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows member to edit themselves", async () => {
    const prisma = getTestPrisma();
    const updated = await updateMember(
      prisma,
      MEMBER_ID,
      { nickname: "Self" },
      MEMBER_ACTOR,
    );

    expect(updated.nickname).toBe("Self");

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
    const prisma = getTestPrisma();
    const updated = await updateMember(
      prisma,
      MEMBER_ID,
      { university: "BME", major: "VIK" },
      ACTOR,
    );

    expect(updated.university).toBe("BME");
    expect(updated.major).toBe("VIK");
  });

  it("allows admin to edit any member", async () => {
    const prisma = getTestPrisma();
    const updated = await updateMember(
      prisma,
      MEMBER_ID,
      { nickname: "Admin Edit" },
      ADMIN_ACTOR,
    );

    expect(updated.nickname).toBe("Admin Edit");
  });

  it("returns unchanged member when no fields differ", async () => {
    const prisma = getTestPrisma();
    const result = await updateMember(
      prisma,
      MEMBER_ID,
      { firstName: "Target" },
      ACTOR,
    );

    expect(result.firstName).toBe("Target");

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(0);
  });

  it("throws ValidationError for invalid data", async () => {
    const prisma = getTestPrisma();
    await expect(
      updateMember(prisma, MEMBER_ID, { email: "not-an-email" }, ACTOR),
    ).rejects.toThrow(ValidationError);
  });

  // ─── Status changes ─────────────────────────────────────────────────────────

  it("throws ForbiddenError when member tries to change status", async () => {
    const prisma = getTestPrisma();
    await expect(
      updateMember(
        prisma,
        MEMBER_ID,
        { status: "MEMBER_CANDIDATE" },
        MEMBER_ACTOR,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows leader to change status with timeline entry", async () => {
    const prisma = getTestPrisma();
    const updated = await updateMember(
      prisma,
      MEMBER_ID,
      { status: "MEMBER_CANDIDATE" },
      ACTOR,
    );

    expect(updated.status).toBe("MEMBER_CANDIDATE");

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "STATUS_CHANGED",
      status: "MEMBER_CANDIDATE",
    });

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "STATUS_CHANGED",
      actorId: ACTOR.id,
      diff: {
        status: { old: "MEMBER_CANDIDATE_CANDIDATE", new: "MEMBER_CANDIDATE" },
      },
    });
  });

  it("allows admin to change status", async () => {
    const prisma = getTestPrisma();
    const updated = await updateMember(
      prisma,
      MEMBER_ID,
      { status: "MEMBER" },
      ADMIN_ACTOR,
    );

    expect(updated.status).toBe("MEMBER");
  });

  it("creates separate audit entries for status change and field update", async () => {
    const prisma = getTestPrisma();
    await updateMember(
      prisma,
      MEMBER_ID,
      { status: "MEMBER_CANDIDATE", nickname: "Promoted" },
      ACTOR,
    );

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
      diff: { nickname: { old: null, new: "Promoted" } },
    });
  });

  it("does not create timeline entry for non-status updates", async () => {
    const prisma = getTestPrisma();
    await updateMember(prisma, MEMBER_ID, { nickname: "Updated" }, ACTOR);

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(0);
  });

  // ─── websiteUsername ────────────────────────────────────────────────────────

  it("strips websiteUsername when set by non-admin", async () => {
    const prisma = getTestPrisma();
    const updated = await updateMember(
      prisma,
      MEMBER_ID,
      { websiteUsername: "override", nickname: "Also Changed" },
      ACTOR,
    );

    expect(updated.websiteUsername).toBeNull();
    expect(updated.nickname).toBe("Also Changed");
  });

  it("allows admin to set websiteUsername", async () => {
    const prisma = getTestPrisma();
    const updated = await updateMember(
      prisma,
      MEMBER_ID,
      { websiteUsername: "custom" },
      ADMIN_ACTOR,
    );

    expect(updated.websiteUsername).toBe("custom");

    const member = await prisma.member.findUnique({
      where: { id: MEMBER_ID },
    });
    expect(member?.websiteUsername).toBe("custom");
  });
});

// ─── archiveMember ───────────────────────────────────────────────────────────

describe("archiveMember", () => {
  it("throws NotFoundError for non-existent member", async () => {
    const prisma = getTestPrisma();
    await expect(archiveMember(prisma, "non-existent", ACTOR)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("archives member with timeline and audit log", async () => {
    const prisma = getTestPrisma();
    await archiveMember(prisma, MEMBER_ID, ACTOR);

    const member = await prisma.member.findUnique({
      where: { id: MEMBER_ID },
    });
    expect(member?.archived).toBe(true);
    expect(member?.archivedAt).toBeDefined();

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].action).toBe("MEMBER_ARCHIVED");

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "MEMBER_ARCHIVED",
      actorId: ACTOR.id,
      diff: { archived: { old: false, new: true } },
    });
  });
});

// ─── batchArchive ───────────────────────────────────────────────────────────

describe("batchArchive", () => {
  it("archives multiple members with per-member timeline and audit log", async () => {
    const prisma = getTestPrisma();
    const id2 = crypto.randomUUID();
    await prisma.member.create({
      data: {
        id: id2,
        firstName: "Second",
        lastName: "Target",
        email: "second@test.com",
        joinedSemester: "2025/2026/1",
      },
    });

    const result = await batchArchive(prisma, [MEMBER_ID, id2], ACTOR);
    expect(result).toEqual({ count: 2 });

    const members = await prisma.member.findMany({
      where: { id: { in: [MEMBER_ID, id2] } },
    });
    expect(members.every((m) => m.archived)).toBe(true);
    expect(members.every((m) => m.archivedAt !== null)).toBe(true);

    const timeline = await prisma.timelineEntry.findMany();
    expect(timeline).toHaveLength(2);
    expect(timeline.every((t) => t.action === "MEMBER_ARCHIVED")).toBe(true);

    const audit = await prisma.auditLog.findMany();
    expect(audit).toHaveLength(2);
    expect(audit.every((a) => a.action === "MEMBER_ARCHIVED")).toBe(true);
  });

  it("skips already-archived members", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { archived: true, archivedAt: new Date() },
    });

    const result = await batchArchive(prisma, [MEMBER_ID, ACTOR.id], ACTOR);
    expect(result).toEqual({ count: 1 });

    const timeline = await prisma.timelineEntry.findMany();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].memberId).toBe(ACTOR.id);
  });

  it("returns count 0 when all members are already archived", async () => {
    const prisma = getTestPrisma();
    await prisma.member.updateMany({
      data: { archived: true, archivedAt: new Date() },
    });

    const result = await batchArchive(prisma, [MEMBER_ID, ACTOR.id], ACTOR);
    expect(result).toEqual({ count: 0 });

    const timeline = await prisma.timelineEntry.findMany();
    expect(timeline).toHaveLength(0);
  });
});

// ─── batchUpdateStatus ──────────────────────────────────────────────────────

describe("batchUpdateStatus", () => {
  it("updates status for multiple members with per-member timeline and audit log", async () => {
    const prisma = getTestPrisma();
    const result = await batchUpdateStatus(
      prisma,
      [MEMBER_ID, ACTOR.id],
      "MEMBER_CANDIDATE",
      ACTOR,
    );
    expect(result).toEqual({ count: 2 });

    const members = await prisma.member.findMany({
      where: { id: { in: [MEMBER_ID, ACTOR.id] } },
    });
    expect(members.every((m) => m.status === "MEMBER_CANDIDATE")).toBe(true);

    const timeline = await prisma.timelineEntry.findMany();
    expect(timeline).toHaveLength(2);
    expect(
      timeline.every(
        (t) => t.action === "STATUS_CHANGED" && t.status === "MEMBER_CANDIDATE",
      ),
    ).toBe(true);

    const audit = await prisma.auditLog.findMany();
    expect(audit).toHaveLength(2);
    expect(audit.every((a) => a.action === "STATUS_CHANGED")).toBe(true);
    expect(
      audit.every(
        (a) => (a.diff as Record<string, unknown>).status !== undefined,
      ),
    ).toBe(true);
  });

  it("skips members already at the target status", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { status: "MEMBER" },
    });

    const result = await batchUpdateStatus(
      prisma,
      [MEMBER_ID, ACTOR.id],
      "MEMBER",
      ACTOR,
    );
    // Only ACTOR.id should be updated (was MEMBER_CANDIDATE_CANDIDATE)
    expect(result).toEqual({ count: 1 });

    const timeline = await prisma.timelineEntry.findMany();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].memberId).toBe(ACTOR.id);
  });

  it("skips archived members", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { archived: true, archivedAt: new Date() },
    });

    const result = await batchUpdateStatus(
      prisma,
      [MEMBER_ID, ACTOR.id],
      "MEMBER",
      ACTOR,
    );
    expect(result).toEqual({ count: 1 });
    expect((await prisma.timelineEntry.findMany())[0].memberId).toBe(ACTOR.id);
  });
});
