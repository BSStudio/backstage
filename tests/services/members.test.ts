import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAuthentikUser,
  mockOrchestrateDeactivate,
  mockOrchestrateUpdateAttributes,
  mockOrchestrateStatusChange,
  mockOrchestrateAddToGroup,
  mockOrchestrateRemoveFromGroup,
  mockOrchestrateCreateWebsiteUser,
  mockOrchestrateUpdateWebsiteUser,
  mockOrchestrateDeactivateWebsiteUser,
  mockOrchestrateAddToGoogleGroup,
  mockOrchestrateRemoveFromGoogleGroup,
} = vi.hoisted(() => ({
  mockCreateAuthentikUser: vi.fn(),
  mockOrchestrateDeactivate: vi.fn(),
  mockOrchestrateUpdateAttributes: vi.fn(),
  mockOrchestrateStatusChange: vi.fn(),
  mockOrchestrateAddToGroup: vi.fn(),
  mockOrchestrateRemoveFromGroup: vi.fn(),
  mockOrchestrateCreateWebsiteUser: vi.fn(),
  mockOrchestrateUpdateWebsiteUser: vi.fn(),
  mockOrchestrateDeactivateWebsiteUser: vi.fn(),
  mockOrchestrateAddToGoogleGroup: vi.fn(),
  mockOrchestrateRemoveFromGoogleGroup: vi.fn(),
}));

vi.mock("@/lib/sync/authentik/orchestrators", () => ({
  createAuthentikUser: mockCreateAuthentikUser,
  orchestrateDeactivate: mockOrchestrateDeactivate,
  orchestrateUpdateAttributes: mockOrchestrateUpdateAttributes,
  orchestrateStatusChange: mockOrchestrateStatusChange,
  orchestrateAddToGroup: mockOrchestrateAddToGroup,
  orchestrateRemoveFromGroup: mockOrchestrateRemoveFromGroup,
  buildAuthentikAttributes: (m: {
    firstName: string;
    lastName: string;
    mobile: string | null;
    avatarUrl: string | null;
  }) => {
    const attrs: Record<string, unknown> = {
      first_name: m.firstName,
      last_name: m.lastName,
    };
    if (m.mobile) attrs.mobile = m.mobile;
    if (m.avatarUrl) attrs.avatar_url = m.avatarUrl;
    return attrs;
  },
}));

const websiteOk = { success: true as const, result: null };
vi.mock("@/lib/sync/website/orchestrators", () => ({
  orchestrateCreateWebsiteUser: mockOrchestrateCreateWebsiteUser,
  orchestrateUpdateWebsiteUser: mockOrchestrateUpdateWebsiteUser,
  orchestrateDeactivateWebsiteUser: mockOrchestrateDeactivateWebsiteUser,
}));

vi.mock("@/lib/sync/google/orchestrators", () => ({
  orchestrateAddToGoogleGroup: mockOrchestrateAddToGoogleGroup,
  orchestrateRemoveFromGoogleGroup: mockOrchestrateRemoveFromGoogleGroup,
}));

import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/services/members";
import {
  archiveMember,
  assignRole,
  batchArchive,
  batchUpdateStatus,
  createMember,
  getMember,
  listMembers,
  removeMemberAvatar,
  removeRole,
  updateMember,
  uploadMemberAvatar,
} from "@/lib/services/members";
import { getTestPrisma } from "../setup";

const ACTOR: Actor = { id: "test-actor-id", role: "LEADER" };
const ADMIN_ACTOR: Actor = { id: "test-actor-id", role: "ADMIN" };
const MEMBER_ACTOR: Actor = { id: "test-member-id", role: "MEMBER" };

const MEMBER_ID = "test-member-id";

let nextAuthentikUuid = 0;

const LEADERSHIP_UUID = "leadership-group-uuid";

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("AUTHENTIK_GROUP_LEADERSHIP_UUID", LEADERSHIP_UUID);
  nextAuthentikUuid = 0;
  mockCreateAuthentikUser.mockImplementation((data: { email: string }) => {
    nextAuthentikUuid++;
    return Promise.resolve({
      pk: nextAuthentikUuid,
      uuid: `authentik-uuid-${nextAuthentikUuid}`,
      username: data.email.split("@")[0],
      name: "Authentik User",
      email: data.email,
      is_active: true,
      path: "users",
      attributes: {},
      groups: [],
    });
  });
  mockOrchestrateDeactivate.mockResolvedValue({ success: true, result: null });
  mockOrchestrateUpdateAttributes.mockResolvedValue({
    success: true,
    result: null,
  });
  mockOrchestrateStatusChange.mockResolvedValue([]);
  mockOrchestrateAddToGroup.mockResolvedValue({ success: true, result: null });
  mockOrchestrateRemoveFromGroup.mockResolvedValue({
    success: true,
    result: null,
  });
  mockOrchestrateCreateWebsiteUser.mockResolvedValue(websiteOk);
  mockOrchestrateUpdateWebsiteUser.mockResolvedValue(websiteOk);
  mockOrchestrateDeactivateWebsiteUser.mockResolvedValue(websiteOk);
  mockOrchestrateAddToGoogleGroup.mockResolvedValue(websiteOk);
  mockOrchestrateRemoveFromGoogleGroup.mockResolvedValue(websiteOk);

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
      websiteUserId: "9001",
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
      websiteUserId: "9002",
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

    const { member, syncErrors } = await createMember(
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

    expect(syncErrors).toEqual([]);
    expect(mockCreateAuthentikUser).toHaveBeenCalledWith({
      firstName: "New",
      lastName: "Member",
      email: "new@test.com",
      mobile: "+36301234567",
      status: "MEMBER_CANDIDATE_CANDIDATE",
    });

    // Member id should match Authentik uuid
    expect(member.id).toMatch(/^authentik-uuid-/);

    // SyncJob recorded as SUCCESS
    const syncJobs = await prisma.syncJob.findMany({
      where: { memberId: member.id },
    });
    expect(syncJobs).toHaveLength(1);
    expect(syncJobs[0]).toMatchObject({
      operation: "CREATE_USER",
      status: "SUCCESS",
      attempts: 1,
    });

    expect(member).toMatchObject({
      firstName: "New",
      lastName: "Member",
      email: "new@test.com",
      nickname: "Newbie",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      archived: false,
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

  it("persists the Drupal uid returned by the website CREATE_USER", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateCreateWebsiteUser.mockResolvedValueOnce({
      success: true,
      result: { userId: "4242", username: "nmember" },
    });

    const { member } = await createMember(
      prisma,
      { firstName: "New", lastName: "Member", email: "new@test.com" },
      ACTOR,
    );

    expect(member.websiteUserId).toBe("4242");
    const persisted = await prisma.member.findUnique({
      where: { id: member.id },
    });
    expect(persisted?.websiteUserId).toBe("4242");
  });

  it("creates the website user with the username Authentik resolved", async () => {
    const prisma = getTestPrisma();
    // Collision: Authentik hands back jkovacs2, not the derived base.
    mockCreateAuthentikUser.mockResolvedValueOnce({
      pk: 7,
      uuid: "authentik-uuid-collision",
      username: "jkovacs2",
      name: "János Kovács",
      email: "janos@test.com",
      is_active: true,
      path: "users",
      attributes: {},
      groups: [],
    });

    await createMember(
      prisma,
      { firstName: "János", lastName: "Kovács", email: "janos@test.com" },
      ACTOR,
    );

    expect(mockOrchestrateCreateWebsiteUser.mock.calls[0][2]).toMatchObject({
      username: "jkovacs2",
    });
  });

  it("reports a syncError but still creates the member when the website create fails", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateCreateWebsiteUser.mockResolvedValueOnce({
      success: false,
      error: "User creation failed for nmember",
    });

    const { member, syncErrors } = await createMember(
      prisma,
      { firstName: "New", lastName: "Member", email: "new@test.com" },
      ACTOR,
    );

    expect(syncErrors).toEqual(["User creation failed for nmember"]);
    expect(member.websiteUserId).toBeNull();

    const persisted = await prisma.member.findUnique({
      where: { id: member.id },
    });
    expect(persisted?.websiteUserId).toBeNull();
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

  it("reports an empty email as missing rather than malformed", async () => {
    const prisma = getTestPrisma();
    const error = await createMember(
      prisma,
      { firstName: "A", lastName: "B", email: "" },
      ACTOR,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toMatchObject({
      properties: { email: { errors: ["Az email-cím megadása kötelező"] } },
    });
  });

  it("trims whitespace around the email instead of rejecting it", async () => {
    const prisma = getTestPrisma();
    const { member } = await createMember(
      prisma,
      { firstName: "A", lastName: "B", email: "  padded@test.com  " },
      ACTOR,
    );

    expect(member.email).toBe("padded@test.com");
  });

  it("reports a whitespace-only email as missing", async () => {
    const prisma = getTestPrisma();
    const error = await createMember(
      prisma,
      { firstName: "A", lastName: "B", email: "   " },
      ACTOR,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toMatchObject({
      properties: { email: { errors: ["Az email-cím megadása kötelező"] } },
    });
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

  it("stores null for empty optional fields", async () => {
    const prisma = getTestPrisma();
    const { member } = await createMember(
      prisma,
      {
        firstName: "Minimal",
        lastName: "User",
        email: "minimal@test.com",
        nickname: "",
        mobile: "",
        university: "",
        major: "",
        dormRoom: "",
      },
      ACTOR,
    );

    expect(member.nickname).toBeNull();
    expect(member.mobile).toBeNull();
    expect(member.university).toBeNull();
    expect(member.major).toBeNull();
    expect(member.dormRoom).toBeNull();
  });

  it("ignores unknown fields in input", async () => {
    const prisma = getTestPrisma();
    const { member } = await createMember(
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

  it("adds the new member to the Google Group", async () => {
    const prisma = getTestPrisma();
    const { syncErrors } = await createMember(
      prisma,
      { firstName: "New", lastName: "Member", email: "new@test.com" },
      ACTOR,
    );

    expect(syncErrors).toEqual([]);
    expect(mockOrchestrateAddToGoogleGroup).toHaveBeenCalledTimes(1);
    const [, memberId, email] = mockOrchestrateAddToGoogleGroup.mock.calls[0];
    expect(memberId).toMatch(/^authentik-uuid-/);
    expect(email).toBe("new@test.com");
  });

  it("returns a syncError when the Google Group add fails", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateAddToGoogleGroup.mockResolvedValueOnce({
      success: false,
      error: "Google API error: Permission denied",
    });

    const { member, syncErrors } = await createMember(
      prisma,
      { firstName: "New", lastName: "Member", email: "new@test.com" },
      ACTOR,
    );

    expect(syncErrors).toEqual(["Google API error: Permission denied"]);
    expect(member.id).toMatch(/^authentik-uuid-/);
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
    const { member: updated } = await updateMember(
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
    const { member: updated } = await updateMember(
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
    const { member: updated } = await updateMember(
      prisma,
      MEMBER_ID,
      { nickname: "Admin Edit" },
      ADMIN_ACTOR,
    );

    expect(updated.nickname).toBe("Admin Edit");
  });

  it("clears a field by setting it to null when an empty string is sent", async () => {
    const prisma = getTestPrisma();

    // First set a value
    await updateMember(prisma, MEMBER_ID, { dormRoom: "A301" }, ACTOR);
    const before = await prisma.member.findUnique({ where: { id: MEMBER_ID } });
    expect(before?.dormRoom).toBe("A301");

    // Then clear it by sending an empty string
    const { member: updated } = await updateMember(
      prisma,
      MEMBER_ID,
      { dormRoom: "" },
      ACTOR,
    );

    expect(updated.dormRoom).toBeNull();

    // Verify DB
    const after = await prisma.member.findUnique({ where: { id: MEMBER_ID } });
    expect(after?.dormRoom).toBeNull();
  });

  it("clears multiple optional fields at once", async () => {
    const prisma = getTestPrisma();

    await updateMember(
      prisma,
      MEMBER_ID,
      { nickname: "Test", university: "BME", major: "VIK" },
      ACTOR,
    );

    const { member: updated } = await updateMember(
      prisma,
      MEMBER_ID,
      { nickname: "", university: "", major: "" },
      ACTOR,
    );

    expect(updated.nickname).toBeNull();
    expect(updated.university).toBeNull();
    expect(updated.major).toBeNull();
  });

  it("returns unchanged member when no fields differ", async () => {
    const prisma = getTestPrisma();
    const { member: result } = await updateMember(
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

  // ─── Email changes ──────────────────────────────────────────────────────────

  it("throws ForbiddenError when member tries to change their email", async () => {
    const prisma = getTestPrisma();
    await expect(
      updateMember(
        prisma,
        MEMBER_ID,
        { email: "attacker@test.com" },
        MEMBER_ACTOR,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets a member submit their unchanged email alongside other fields", async () => {
    const prisma = getTestPrisma();
    const { member: updated } = await updateMember(
      prisma,
      MEMBER_ID,
      { email: "target@test.com", nickname: "Self" },
      MEMBER_ACTOR,
    );

    expect(updated.email).toBe("target@test.com");
    expect(updated.nickname).toBe("Self");
  });

  it("allows leader to change the email", async () => {
    const prisma = getTestPrisma();
    const { member: updated } = await updateMember(
      prisma,
      MEMBER_ID,
      { email: "moved@test.com" },
      ACTOR,
    );

    expect(updated.email).toBe("moved@test.com");
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
    const { member: updated } = await updateMember(
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
    const { member: updated } = await updateMember(
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

  it("calls orchestrateUpdateAttributes when an Authentik-synced field changes", async () => {
    const prisma = getTestPrisma();
    await updateMember(
      prisma,
      MEMBER_ID,
      { firstName: "Updated", mobile: "+36301111111" },
      ACTOR,
    );

    expect(mockOrchestrateUpdateAttributes).toHaveBeenCalledTimes(1);
    const args = mockOrchestrateUpdateAttributes.mock.calls[0];
    expect(args[1]).toBe(MEMBER_ID);
    expect(args[2]).toEqual({
      name: "Updated Member",
      email: "target@test.com",
      attributes: {
        first_name: "Updated",
        last_name: "Member",
        mobile: "+36301111111",
      },
    });
    expect(mockOrchestrateStatusChange).not.toHaveBeenCalled();
  });

  it("includes avatar_url in attributes when member has one", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { avatarUrl: "/avatars/target-square.webp" },
    });

    await updateMember(prisma, MEMBER_ID, { firstName: "Renamed" }, ACTOR);

    expect(mockOrchestrateUpdateAttributes).toHaveBeenCalledTimes(1);
    const args = mockOrchestrateUpdateAttributes.mock.calls[0];
    expect(args[2].attributes).toEqual({
      first_name: "Renamed",
      last_name: "Member",
      avatar_url: "/avatars/target-square.webp",
    });
  });

  it("does not call orchestrateUpdateAttributes when only non-synced fields change", async () => {
    const prisma = getTestPrisma();
    await updateMember(
      prisma,
      MEMBER_ID,
      { nickname: "Nicknamed", university: "BME" },
      ACTOR,
    );

    expect(mockOrchestrateUpdateAttributes).not.toHaveBeenCalled();
  });

  it("calls orchestrateStatusChange on status change", async () => {
    const prisma = getTestPrisma();
    await updateMember(prisma, MEMBER_ID, { status: "MEMBER" }, ACTOR);

    expect(mockOrchestrateStatusChange).toHaveBeenCalledTimes(1);
    const args = mockOrchestrateStatusChange.mock.calls[0];
    expect(args[1]).toBe(MEMBER_ID);
    expect(args[2]).toBe("MEMBER_CANDIDATE_CANDIDATE");
    expect(args[3]).toBe("MEMBER");
  });

  it("collects syncErrors from failed orchestrators", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateUpdateAttributes.mockResolvedValueOnce({
      success: false,
      error: "attr sync failed",
    });
    mockOrchestrateStatusChange.mockResolvedValueOnce([
      { success: false, error: "remove group failed" },
      { success: true, result: null },
    ]);

    const result = await updateMember(
      prisma,
      MEMBER_ID,
      { firstName: "X", status: "MEMBER" },
      ACTOR,
    );

    expect(result.syncErrors).toEqual([
      "attr sync failed",
      "remove group failed",
    ]);
  });

  it("maps every website-tracked field onto the Drupal update payload", async () => {
    const prisma = getTestPrisma();

    await updateMember(
      prisma,
      MEMBER_ID,
      {
        firstName: "János",
        lastName: "Kovács",
        nickname: "Jani",
        email: "jkovacs@bss.hu",
        mobile: "+36301234567",
        status: "MEMBER",
      },
      ACTOR,
    );

    expect(mockOrchestrateUpdateWebsiteUser).toHaveBeenCalledTimes(1);
    const [, memberId, fields] = mockOrchestrateUpdateWebsiteUser.mock.calls[0];
    expect(memberId).toBe(MEMBER_ID);
    expect(fields).toEqual({
      fullname: "Kovács János",
      nickname: "Jani",
      email: "jkovacs@bss.hu",
      mobile: "+36301234567",
      position: "stúdiós",
    });
  });

  it("sends an empty string when a website-tracked field is cleared", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { mobile: "+36301234567", nickname: "Jani" },
    });

    await updateMember(prisma, MEMBER_ID, { mobile: "", nickname: "" }, ACTOR);

    expect(mockOrchestrateUpdateWebsiteUser.mock.calls[0][2]).toEqual({
      mobile: "",
      // Drupal has no nickname fallback, so the first name stands in.
      nickname: "Target",
    });
  });

  it("collects a syncError when the website update fails", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateUpdateWebsiteUser.mockResolvedValueOnce({
      success: false,
      error: "Update Személyes adatok failed for 9002",
    });

    const result = await updateMember(
      prisma,
      MEMBER_ID,
      { nickname: "Nicknamed" },
      ACTOR,
    );

    expect(result.syncErrors).toEqual([
      "Update Személyes adatok failed for 9002",
    ]);
  });

  it("does not touch the website when only non-tracked fields change", async () => {
    const prisma = getTestPrisma();
    await updateMember(prisma, MEMBER_ID, { university: "BME" }, ACTOR);

    expect(mockOrchestrateUpdateWebsiteUser).not.toHaveBeenCalled();
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
    const result = await archiveMember(prisma, MEMBER_ID, ACTOR);

    expect(result.syncErrors).toEqual([]);
    expect(mockOrchestrateDeactivate).toHaveBeenCalledTimes(1);
    expect(mockOrchestrateDeactivate.mock.calls[0][1]).toBe(MEMBER_ID);

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

  it("returns syncErrors when Authentik deactivation fails", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateDeactivate.mockResolvedValueOnce({
      success: false,
      error: "Authentik unreachable",
    });

    const result = await archiveMember(prisma, MEMBER_ID, ACTOR);

    expect(result.syncErrors).toEqual(["Authentik unreachable"]);
    // DB write still happened
    const member = await prisma.member.findUnique({
      where: { id: MEMBER_ID },
    });
    expect(member?.archived).toBe(true);
  });

  it("returns syncErrors from both systems when each deactivation fails", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateDeactivate.mockResolvedValueOnce({
      success: false,
      error: "Authentik unreachable",
    });
    mockOrchestrateDeactivateWebsiteUser.mockResolvedValueOnce({
      success: false,
      error: "Deactivation step 1 failed for user 9002",
    });

    const result = await archiveMember(prisma, MEMBER_ID, ACTOR);

    expect(result.syncErrors).toEqual([
      "Authentik unreachable",
      "Deactivation step 1 failed for user 9002",
    ]);
    expect(mockOrchestrateDeactivateWebsiteUser.mock.calls[0][1]).toBe(
      MEMBER_ID,
    );
  });

  it("leaves the Google Group alone unless asked", async () => {
    const prisma = getTestPrisma();
    await archiveMember(prisma, MEMBER_ID, ACTOR);

    expect(mockOrchestrateRemoveFromGoogleGroup).not.toHaveBeenCalled();
  });

  it("removes the member from the Google Group when asked", async () => {
    const prisma = getTestPrisma();
    await archiveMember(prisma, MEMBER_ID, ACTOR, {
      removeFromGoogleGroup: true,
    });

    expect(mockOrchestrateRemoveFromGoogleGroup).toHaveBeenCalledTimes(1);
    const [, memberId, email] =
      mockOrchestrateRemoveFromGoogleGroup.mock.calls[0];
    expect(memberId).toBe(MEMBER_ID);
    expect(email).toBe("target@test.com");
  });

  it("returns a syncError when the Google Group removal fails", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateRemoveFromGoogleGroup.mockResolvedValueOnce({
      success: false,
      error: "Google API error: Backend error",
    });

    const result = await archiveMember(prisma, MEMBER_ID, ACTOR, {
      removeFromGoogleGroup: true,
    });

    expect(result.syncErrors).toEqual(["Google API error: Backend error"]);
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
        websiteUserId: "9003",
      },
    });

    const result = await batchArchive(prisma, [MEMBER_ID, id2], ACTOR);
    expect(result).toEqual({ count: 2, syncErrors: [] });

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

  it("removes each archived member from the Google Group when asked", async () => {
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

    await batchArchive(prisma, [MEMBER_ID, id2], ACTOR, {
      removeFromGoogleGroup: true,
    });

    expect(mockOrchestrateRemoveFromGoogleGroup).toHaveBeenCalledTimes(2);
    expect(
      mockOrchestrateRemoveFromGoogleGroup.mock.calls.map(
        ([, , email]) => email,
      ),
    ).toEqual(expect.arrayContaining(["target@test.com", "second@test.com"]));
  });

  it("skips already-archived members", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { archived: true, archivedAt: new Date() },
    });

    const result = await batchArchive(prisma, [MEMBER_ID, ACTOR.id], ACTOR);
    expect(result).toEqual({ count: 1, syncErrors: [] });

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
    expect(result).toEqual({ count: 0, syncErrors: [] });

    const timeline = await prisma.timelineEntry.findMany();
    expect(timeline).toHaveLength(0);
  });

  it("collects syncErrors from failed deactivations", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateDeactivate
      .mockResolvedValueOnce({ success: false, error: "first failed" })
      .mockResolvedValueOnce({ success: false, error: "second failed" });

    const result = await batchArchive(prisma, [MEMBER_ID, ACTOR.id], ACTOR);

    expect(result.count).toBe(2);
    expect(result.syncErrors).toEqual(["first failed", "second failed"]);
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
    expect(result).toEqual({ count: 2, syncErrors: [] });

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
    expect(result).toEqual({ count: 1, syncErrors: [] });

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
    expect(result).toEqual({ count: 1, syncErrors: [] });
    expect((await prisma.timelineEntry.findMany())[0].memberId).toBe(ACTOR.id);
  });

  it("collects syncErrors from failed status changes", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateStatusChange.mockResolvedValueOnce([
      { success: false, error: "remove failed" },
      { success: true, result: null },
    ]);

    const result = await batchUpdateStatus(
      prisma,
      [MEMBER_ID],
      "MEMBER",
      ACTOR,
    );

    expect(result.count).toBe(1);
    expect(result.syncErrors).toEqual(["remove failed"]);
  });
});

// ─── assignRole ─────────────────────────────────────────────────────────────

describe("assignRole", () => {
  it("throws NotFoundError for non-existent member", async () => {
    const prisma = getTestPrisma();
    await expect(
      assignRole(prisma, "non-existent", "Lead", [], ACTOR),
    ).rejects.toThrow(NotFoundError);
  });

  it("creates a new leadership role with timeline and audit log", async () => {
    const prisma = getTestPrisma();
    await assignRole(
      prisma,
      MEMBER_ID,
      "Főszerkesztő",
      ["group-1", "group-2"],
      ACTOR,
    );

    const role = await prisma.leadershipRole.findUnique({
      where: { memberId: MEMBER_ID },
    });
    expect(role).toMatchObject({
      label: "Főszerkesztő",
      authentikGroupIds: ["group-1", "group-2"],
    });

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "ROLE_ASSIGNED",
      roleLabel: "Főszerkesztő",
    });

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "ROLE_ASSIGNED",
      diff: {
        label: { old: null, new: "Főszerkesztő" },
        authentikGroupIds: { old: null, new: ["group-1", "group-2"] },
      },
    });
  });

  it("updates an existing role with ROLE_CHANGED timeline entry and audit log", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "PR-felelős",
        authentikGroupIds: ["group-1"],
      },
    });

    await assignRole(
      prisma,
      MEMBER_ID,
      "Főszerkesztő",
      ["group-1", "group-2"],
      ACTOR,
    );

    const role = await prisma.leadershipRole.findUnique({
      where: { memberId: MEMBER_ID },
    });
    expect(role?.label).toBe("Főszerkesztő");
    expect(role?.authentikGroupIds).toEqual(["group-1", "group-2"]);

    // Timeline entry recorded for the role change
    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "ROLE_CHANGED",
      roleLabel: "Főszerkesztő",
    });

    // Audit log records the change under ROLE_CHANGED
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "ROLE_CHANGED",
      diff: {
        label: { old: "PR-felelős", new: "Főszerkesztő" },
        authentikGroupIds: { old: ["group-1"], new: ["group-1", "group-2"] },
      },
    });
  });

  it("is a no-op when label and groups are unchanged", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Főszerkesztő",
        authentikGroupIds: ["group-1", "group-2"],
      },
    });

    await assignRole(
      prisma,
      MEMBER_ID,
      "Főszerkesztő",
      ["group-1", "group-2"],
      ACTOR,
    );

    // No timeline or audit entries created
    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(0);
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(0);
  });

  it("is a no-op when groups are passed in a different order", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Főszerkesztő",
        authentikGroupIds: ["group-1", "group-2"],
      },
    });

    await assignRole(
      prisma,
      MEMBER_ID,
      "Főszerkesztő",
      ["group-2", "group-1"],
      ACTOR,
    );

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(0);
  });

  it("writes a ROLE_CHANGED entry when label is unchanged but group count changes", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Főszerkesztő",
        authentikGroupIds: ["group-1"],
      },
    });

    await assignRole(
      prisma,
      MEMBER_ID,
      "Főszerkesztő",
      ["group-1", "group-2"],
      ACTOR,
    );

    const role = await prisma.leadershipRole.findUnique({
      where: { memberId: MEMBER_ID },
    });
    expect(role?.authentikGroupIds).toEqual(["group-1", "group-2"]);

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "ROLE_CHANGED",
      roleLabel: "Főszerkesztő",
    });

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "ROLE_CHANGED",
      diff: {
        label: { old: "Főszerkesztő", new: "Főszerkesztő" },
        authentikGroupIds: { old: ["group-1"], new: ["group-1", "group-2"] },
      },
    });
  });

  it("writes a ROLE_CHANGED entry when label is unchanged but group IDs differ", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Főszerkesztő",
        authentikGroupIds: ["group-1", "group-2"],
      },
    });

    await assignRole(
      prisma,
      MEMBER_ID,
      "Főszerkesztő",
      ["group-1", "group-3"],
      ACTOR,
    );

    const role = await prisma.leadershipRole.findUnique({
      where: { memberId: MEMBER_ID },
    });
    expect(role?.authentikGroupIds).toEqual(["group-1", "group-3"]);

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "ROLE_CHANGED",
      roleLabel: "Főszerkesztő",
    });

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "ROLE_CHANGED",
      diff: {
        label: { old: "Főszerkesztő", new: "Főszerkesztő" },
        authentikGroupIds: {
          old: ["group-1", "group-2"],
          new: ["group-1", "group-3"],
        },
      },
    });
  });

  it("collects syncErrors from failed group operations", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateAddToGroup.mockResolvedValueOnce({
      success: false,
      error: "add failed",
    });

    const result = await assignRole(
      prisma,
      MEMBER_ID,
      "Lead",
      ["group-1"],
      ACTOR,
    );

    expect(result.syncErrors).toEqual(["add failed"]);
  });

  it("adds member to common Leadership group on new role assignment", async () => {
    const prisma = getTestPrisma();
    await assignRole(prisma, MEMBER_ID, "Lead", ["group-1"], ACTOR);

    const calledGroupIds = mockOrchestrateAddToGroup.mock.calls.map(
      (call) => call[2],
    );
    expect(calledGroupIds).toContain(LEADERSHIP_UUID);
    expect(calledGroupIds).toContain("group-1");
  });

  it("does not re-add member to Leadership group on role update", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "PR-felelős",
        authentikGroupIds: ["group-1"],
      },
    });

    await assignRole(prisma, MEMBER_ID, "Főszerkesztő", ["group-2"], ACTOR);

    const calledGroupIds = mockOrchestrateAddToGroup.mock.calls.map(
      (call) => call[2],
    );
    expect(calledGroupIds).not.toContain(LEADERSHIP_UUID);
  });
});

// ─── removeRole ─────────────────────────────────────────────────────────────

describe("removeRole", () => {
  it("throws NotFoundError for non-existent member", async () => {
    const prisma = getTestPrisma();
    await expect(removeRole(prisma, "non-existent", ACTOR)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("does nothing if member has no role", async () => {
    const prisma = getTestPrisma();
    await removeRole(prisma, MEMBER_ID, ACTOR);

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(0);
    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(0);
  });

  it("removes role with timeline and audit log", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Főszerkesztő",
        authentikGroupIds: ["group-1"],
      },
    });

    await removeRole(prisma, MEMBER_ID, ACTOR);

    const role = await prisma.leadershipRole.findUnique({
      where: { memberId: MEMBER_ID },
    });
    expect(role).toBeNull();

    const timeline = await prisma.timelineEntry.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "ROLE_REMOVED",
      roleLabel: "Főszerkesztő",
    });

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "ROLE_REMOVED",
      diff: { label: { old: "Főszerkesztő", new: null } },
    });
  });

  it("collects syncErrors from failed group removals", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Lead",
        authentikGroupIds: ["group-1", "group-2"],
      },
    });
    mockOrchestrateRemoveFromGroup
      .mockResolvedValueOnce({ success: false, error: "remove 1 failed" })
      .mockResolvedValue({ success: true, result: null });

    const result = await removeRole(prisma, MEMBER_ID, ACTOR);

    expect(result.syncErrors).toEqual(["remove 1 failed"]);
  });

  it("removes member from common Leadership group on role removal", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Lead",
        authentikGroupIds: ["group-1"],
      },
    });

    await removeRole(prisma, MEMBER_ID, ACTOR);

    const calledGroupIds = mockOrchestrateRemoveFromGroup.mock.calls.map(
      (call) => call[2],
    );
    expect(calledGroupIds).toContain(LEADERSHIP_UUID);
    expect(calledGroupIds).toContain("group-1");
  });
});

// ─── uploadMemberAvatar ─────────────────────────────────────────────────────

describe("uploadMemberAvatar", () => {
  const URLS = { avatarUrl: "/a.webp", portraitUrl: "/p.webp" };

  it("throws NotFoundError for non-existent member", async () => {
    const prisma = getTestPrisma();
    await expect(
      uploadMemberAvatar(prisma, "non-existent", URLS, ACTOR),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ForbiddenError when member tries to upload for another member", async () => {
    const prisma = getTestPrisma();
    const OTHER_MEMBER: Actor = { id: "some-other-member", role: "MEMBER" };
    await expect(
      uploadMemberAvatar(prisma, MEMBER_ID, URLS, OTHER_MEMBER),
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows member to upload their own avatar", async () => {
    const prisma = getTestPrisma();
    const SELF: Actor = { id: MEMBER_ID, role: "MEMBER" };

    const result = await uploadMemberAvatar(prisma, MEMBER_ID, URLS, SELF);

    expect(result.member.avatarUrl).toBe("/a.webp");
    expect(result.member.portraitUrl).toBe("/p.webp");
  });

  it("writes an AVATAR_UPLOADED audit log entry and syncs on first upload", async () => {
    const prisma = getTestPrisma();
    await uploadMemberAvatar(prisma, MEMBER_ID, URLS, ACTOR);

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "AVATAR_UPLOADED" });
    expect(mockOrchestrateUpdateAttributes).toHaveBeenCalledTimes(1);
    const [, syncedId, syncedData] =
      mockOrchestrateUpdateAttributes.mock.calls[0];
    expect(syncedId).toBe(MEMBER_ID);
    expect(syncedData).toEqual({
      attributes: expect.objectContaining({ avatar_url: "/a.webp" }),
    });
  });

  it("writes an AVATAR_UPLOADED audit log entry on replace but skips the sync", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: URLS,
    });

    await uploadMemberAvatar(prisma, MEMBER_ID, URLS, ACTOR);

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "AVATAR_UPLOADED" });
    expect(mockOrchestrateUpdateAttributes).not.toHaveBeenCalled();
  });

  it("collects syncErrors when Authentik update fails", async () => {
    const prisma = getTestPrisma();
    mockOrchestrateUpdateAttributes.mockResolvedValueOnce({
      success: false,
      error: "Authentik unreachable",
    });

    const result = await uploadMemberAvatar(prisma, MEMBER_ID, URLS, ACTOR);

    expect(result.syncErrors).toEqual(["Authentik unreachable"]);
  });
});

// ─── removeMemberAvatar ─────────────────────────────────────────────────────

describe("removeMemberAvatar", () => {
  it("throws NotFoundError for non-existent member", async () => {
    const prisma = getTestPrisma();
    await expect(
      removeMemberAvatar(prisma, "non-existent", ACTOR),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ForbiddenError when member tries to remove another member's avatar", async () => {
    const prisma = getTestPrisma();
    const OTHER_MEMBER: Actor = { id: "some-other-member", role: "MEMBER" };
    await expect(
      removeMemberAvatar(prisma, MEMBER_ID, OTHER_MEMBER),
    ).rejects.toThrow(ForbiddenError);
  });

  it("is a no-op when member has no avatar", async () => {
    const prisma = getTestPrisma();
    await removeMemberAvatar(prisma, MEMBER_ID, ACTOR);

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(0);
    expect(mockOrchestrateUpdateAttributes).not.toHaveBeenCalled();
  });

  it("clears URLs and writes AVATAR_REMOVED audit log entry", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { avatarUrl: "/old.webp", portraitUrl: "/old-p.webp" },
    });

    const result = await removeMemberAvatar(prisma, MEMBER_ID, ACTOR);

    expect(result.member.avatarUrl).toBeNull();
    expect(result.member.portraitUrl).toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { targetId: MEMBER_ID },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "AVATAR_REMOVED" });
  });

  it("skips the sync when only the portrait was set", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { portraitUrl: "/old-p.webp" },
    });

    const result = await removeMemberAvatar(prisma, MEMBER_ID, ACTOR);

    expect(result.member.portraitUrl).toBeNull();
    expect(mockOrchestrateUpdateAttributes).not.toHaveBeenCalled();
  });

  it("collects syncErrors when Authentik update fails", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { avatarUrl: "/old.webp", portraitUrl: "/old-p.webp" },
    });
    mockOrchestrateUpdateAttributes.mockResolvedValueOnce({
      success: false,
      error: "Authentik unreachable",
    });

    const result = await removeMemberAvatar(prisma, MEMBER_ID, ACTOR);

    expect(result.syncErrors).toEqual(["Authentik unreachable"]);
  });
});
