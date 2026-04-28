import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../../setup";

const {
  mockCreateUser,
  mockUpdateUser,
  mockGetUserPk,
  mockFindAvailableUsername,
  mockAddUserToGroup,
  mockRemoveUserFromGroup,
} = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetUserPk: vi.fn(),
  mockFindAvailableUsername: vi.fn(),
  mockAddUserToGroup: vi.fn(),
  mockRemoveUserFromGroup: vi.fn(),
}));

vi.mock("@/lib/authentik/users", () => ({
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
  getUserPk: mockGetUserPk,
  findAvailableUsername: mockFindAvailableUsername,
}));

vi.mock("@/lib/authentik/groups", () => ({
  addUserToGroup: mockAddUserToGroup,
  removeUserFromGroup: mockRemoveUserFromGroup,
}));

import {
  buildAuthentikAttributes,
  createAuthentikUser,
  orchestrateAddToGroup,
  orchestrateDeactivate,
  orchestrateRemoveFromGroup,
  orchestrateStatusChange,
  orchestrateUpdateAttributes,
} from "@/lib/sync/authentik/orchestrators";

const MEMBER_ID = "uuid-member-1";

beforeEach(async () => {
  vi.clearAllMocks();

  mockGetUserPk.mockResolvedValue(42);
  mockFindAvailableUsername.mockImplementation((base: string) =>
    Promise.resolve(base),
  );
  mockAddUserToGroup.mockResolvedValue(undefined);
  mockRemoveUserFromGroup.mockResolvedValue(undefined);

  vi.stubEnv("AUTHENTIK_GROUP_CANDIDATE_CANDIDATE", "group-cc");
  vi.stubEnv("AUTHENTIK_GROUP_CANDIDATE", "group-c");
  vi.stubEnv("AUTHENTIK_GROUP_MEMBER", "group-m");
  vi.stubEnv("AUTHENTIK_GROUP_ALUMNI", "group-a");

  const prisma = getTestPrisma();
  await prisma.member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "Test",
      lastName: "Member",
      email: "test@example.com",
      joinedSemester: "2025/2026/1",
    },
  });
});

// ─── createAuthentikUser ─────────────────────────────────────────────────────

describe("createAuthentikUser", () => {
  it("derives username, checks availability, and creates with initial group", async () => {
    mockFindAvailableUsername.mockResolvedValue("jkovacs");
    mockCreateUser.mockResolvedValue({ pk: 99, uuid: "new-uuid" });

    const result = await createAuthentikUser({
      firstName: "János",
      lastName: "Kovács",
      email: "jkovacs@example.com",
      mobile: "+36301234567",
      status: "MEMBER_CANDIDATE_CANDIDATE",
    });

    expect(mockFindAvailableUsername).toHaveBeenCalledWith("jkovacs");
    expect(mockCreateUser).toHaveBeenCalledWith({
      username: "jkovacs",
      name: "János Kovács",
      email: "jkovacs@example.com",
      path: "users",
      groups: ["group-cc"],
      attributes: {
        first_name: "János",
        last_name: "Kovács",
        mobile: "+36301234567",
      },
    });
    expect(result).toEqual({ pk: 99, uuid: "new-uuid" });
  });

  it("omits mobile attribute when null but always includes first_name and last_name", async () => {
    mockCreateUser.mockResolvedValue({ pk: 1, uuid: "x" });

    await createAuthentikUser({
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      mobile: null,
      status: "MEMBER",
    });

    const call = mockCreateUser.mock.calls[0][0];
    expect(call.attributes).toEqual({ first_name: "A", last_name: "B" });
    expect(call.groups).toEqual(["group-m"]);
  });
});

// ─── orchestrators ───────────────────────────────────────────────────────────

describe("orchestrateUpdateAttributes", () => {
  it("creates UPDATE_USER job and executes it", async () => {
    const prisma = getTestPrisma();
    mockUpdateUser.mockResolvedValue({ pk: 42 });

    const result = await orchestrateUpdateAttributes(prisma, MEMBER_ID, {
      name: "Updated Name",
      attributes: { avatar_url: "/avatars/x.webp" },
    });

    expect(result.success).toBe(true);

    const jobs = await prisma.syncJob.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].operation).toBe("UPDATE_USER");
    expect(jobs[0].status).toBe("SUCCESS");
  });
});

describe("orchestrateDeactivate", () => {
  it("creates DEACTIVATE_USER job and executes it", async () => {
    const prisma = getTestPrisma();
    mockUpdateUser.mockResolvedValue({ pk: 42, is_active: false });

    await orchestrateDeactivate(prisma, MEMBER_ID);

    const jobs = await prisma.syncJob.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].operation).toBe("DEACTIVATE_USER");
    expect(jobs[0].status).toBe("SUCCESS");
  });
});

describe("orchestrateStatusChange", () => {
  it("creates ADD_TO_GROUP then REMOVE_FROM_GROUP jobs", async () => {
    const prisma = getTestPrisma();

    const results = await orchestrateStatusChange(
      prisma,
      MEMBER_ID,
      "MEMBER_CANDIDATE",
      "MEMBER",
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);

    const jobs = await prisma.syncJob.findMany({
      where: { memberId: MEMBER_ID },
      orderBy: { createdAt: "asc" },
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].operation).toBe("ADD_TO_GROUP");
    expect(jobs[0].payload).toEqual({ groupUuid: "group-m" });
    expect(jobs[1].operation).toBe("REMOVE_FROM_GROUP");
    expect(jobs[1].payload).toEqual({ groupUuid: "group-c" });
  });

  it("skips when source and target map to the same group (ACTIVE_ALUMNI → ALUMNI)", async () => {
    const prisma = getTestPrisma();

    const results = await orchestrateStatusChange(
      prisma,
      MEMBER_ID,
      "ACTIVE_ALUMNI",
      "ALUMNI",
    );

    expect(results).toEqual([]);
    const jobs = await prisma.syncJob.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(jobs).toHaveLength(0);
    expect(mockAddUserToGroup).not.toHaveBeenCalled();
    expect(mockRemoveUserFromGroup).not.toHaveBeenCalled();
  });
});

describe("orchestrateAddToGroup / orchestrateRemoveFromGroup", () => {
  it("creates ADD_TO_GROUP job and executes it", async () => {
    const prisma = getTestPrisma();

    await orchestrateAddToGroup(prisma, MEMBER_ID, "group-xyz");

    expect(mockAddUserToGroup).toHaveBeenCalledWith("group-xyz", 42);
    const jobs = await prisma.syncJob.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(jobs[0].operation).toBe("ADD_TO_GROUP");
    expect(jobs[0].payload).toEqual({ groupUuid: "group-xyz" });
  });

  it("creates REMOVE_FROM_GROUP job and executes it", async () => {
    const prisma = getTestPrisma();

    await orchestrateRemoveFromGroup(prisma, MEMBER_ID, "group-xyz");

    expect(mockRemoveUserFromGroup).toHaveBeenCalledWith("group-xyz", 42);
    const jobs = await prisma.syncJob.findMany({
      where: { memberId: MEMBER_ID },
    });
    expect(jobs[0].operation).toBe("REMOVE_FROM_GROUP");
  });
});

describe("buildAuthentikAttributes", () => {
  it("includes first_name and last_name always", () => {
    const attrs = buildAuthentikAttributes({
      firstName: "János",
      lastName: "Kovács",
      mobile: null,
      avatarUrl: null,
    });
    expect(attrs).toEqual({ first_name: "János", last_name: "Kovács" });
  });

  it("adds mobile when set", () => {
    const attrs = buildAuthentikAttributes({
      firstName: "A",
      lastName: "B",
      mobile: "+36301234567",
      avatarUrl: null,
    });
    expect(attrs).toEqual({
      first_name: "A",
      last_name: "B",
      mobile: "+36301234567",
    });
  });

  it("adds avatar_url when set", () => {
    const attrs = buildAuthentikAttributes({
      firstName: "A",
      lastName: "B",
      mobile: null,
      avatarUrl: "/avatars/x-square.webp",
    });
    expect(attrs).toEqual({
      first_name: "A",
      last_name: "B",
      avatar_url: "/avatars/x-square.webp",
    });
  });

  it("includes both mobile and avatar_url when set", () => {
    const attrs = buildAuthentikAttributes({
      firstName: "A",
      lastName: "B",
      mobile: "+36301234567",
      avatarUrl: "/avatars/x-square.webp",
    });
    expect(attrs).toEqual({
      first_name: "A",
      last_name: "B",
      mobile: "+36301234567",
      avatar_url: "/avatars/x-square.webp",
    });
  });
});
