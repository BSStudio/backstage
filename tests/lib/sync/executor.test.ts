import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../setup";

const {
  mockCreateUser,
  mockUpdateUser,
  mockGetUserPk,
  mockAddUserToGroup,
  mockRemoveUserFromGroup,
  mockUpdateWebsiteUser,
  mockDeactivateWebsiteUser,
  mockCaptureSyncJobFailure,
} = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetUserPk: vi.fn(),
  mockAddUserToGroup: vi.fn(),
  mockRemoveUserFromGroup: vi.fn(),
  mockUpdateWebsiteUser: vi.fn(),
  mockDeactivateWebsiteUser: vi.fn(),
  mockCaptureSyncJobFailure: vi.fn(),
}));

vi.mock("@/lib/observability/capture", () => ({
  captureSyncJobFailure: mockCaptureSyncJobFailure,
}));

vi.mock("@/lib/website/users", () => ({
  createWebsiteUser: vi.fn(),
  updateWebsiteUser: mockUpdateWebsiteUser,
  deactivateWebsiteUser: mockDeactivateWebsiteUser,
}));

vi.mock("@/lib/authentik/users", () => ({
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
  getUserPk: mockGetUserPk,
  findAvailableUsername: vi.fn(),
}));

vi.mock("@/lib/authentik/groups", () => ({
  addUserToGroup: mockAddUserToGroup,
  removeUserFromGroup: mockRemoveUserFromGroup,
}));

import { executeSyncJob } from "@/lib/sync/executor";

const MEMBER_ID = "uuid-member-1";
const UNLINKED_MEMBER_ID = "uuid-member-2";

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetUserPk.mockResolvedValue(42);
  mockAddUserToGroup.mockResolvedValue(undefined);
  mockRemoveUserFromGroup.mockResolvedValue(undefined);
  mockUpdateWebsiteUser.mockResolvedValue(undefined);
  mockDeactivateWebsiteUser.mockResolvedValue(undefined);

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
      websiteUserId: "9001",
    },
  });
  await prisma.member.upsert({
    where: { id: UNLINKED_MEMBER_ID },
    update: {},
    create: {
      id: UNLINKED_MEMBER_ID,
      firstName: "Unlinked",
      lastName: "Member",
      email: "unlinked@example.com",
      joinedSemester: "2025/2026/1",
    },
  });
});

describe("executeSyncJob", () => {
  it("throws when job not found", async () => {
    await expect(
      executeSyncJob(getTestPrisma(), "non-existent"),
    ).rejects.toThrow("SyncJob not found");
  });

  it("marks job as SUCCESS on happy path", async () => {
    const prisma = getTestPrisma();
    mockCreateUser.mockResolvedValue({ pk: 42, uuid: "abc" });

    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "CREATE_USER",
        memberId: MEMBER_ID,
        payload: { username: "test", name: "Test", email: "t@e.com" },
      },
    });

    const result = await executeSyncJob(prisma, job.id);

    expect(result.success).toBe(true);
    const updated = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("SUCCESS");
    expect(updated?.attempts).toBe(1);
  });

  it("marks job as FAILED when client throws", async () => {
    const prisma = getTestPrisma();
    mockCreateUser.mockRejectedValue(new Error("username taken"));

    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "CREATE_USER",
        memberId: MEMBER_ID,
        payload: { username: "t", name: "T", email: "t@e.com" },
      },
    });

    const result = await executeSyncJob(prisma, job.id);

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ error: "username taken" });
    const updated = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("FAILED");
    expect(updated?.result).toEqual({ error: "username taken" });
  });

  it("reports a FAILED job to Sentry with the member and the target tagged", async () => {
    const prisma = getTestPrisma();
    const failure = new Error("username taken");
    mockCreateUser.mockRejectedValue(failure);

    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "CREATE_USER",
        memberId: MEMBER_ID,
        payload: { username: "t", name: "T", email: "t@e.com" },
      },
    });

    await executeSyncJob(prisma, job.id);

    expect(mockCaptureSyncJobFailure).toHaveBeenCalledWith(failure, {
      jobId: job.id,
      memberId: MEMBER_ID,
      target: "AUTHENTIK",
      operation: "CREATE_USER",
      attempts: 1,
    });
  });

  it("does not report a job that succeeds", async () => {
    const prisma = getTestPrisma();
    mockUpdateUser.mockResolvedValue({ pk: 42 });

    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "UPDATE_USER",
        memberId: MEMBER_ID,
        payload: { name: "New Name" },
      },
    });

    await executeSyncJob(prisma, job.id);

    expect(mockCaptureSyncJobFailure).not.toHaveBeenCalled();
  });

  it("dispatches UPDATE_USER with resolved pk", async () => {
    const prisma = getTestPrisma();
    mockUpdateUser.mockResolvedValue({ pk: 42 });

    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "UPDATE_USER",
        memberId: MEMBER_ID,
        payload: { name: "New Name" },
      },
    });

    await executeSyncJob(prisma, job.id);

    expect(mockGetUserPk).toHaveBeenCalledWith(MEMBER_ID);
    expect(mockUpdateUser).toHaveBeenCalledWith(42, { name: "New Name" });
  });

  it("dispatches DEACTIVATE_USER with hardcoded payload", async () => {
    const prisma = getTestPrisma();
    mockUpdateUser.mockResolvedValue({ pk: 42, is_active: false });

    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "DEACTIVATE_USER",
        memberId: MEMBER_ID,
        payload: {},
      },
    });

    await executeSyncJob(prisma, job.id);

    expect(mockUpdateUser).toHaveBeenCalledWith(42, {
      is_active: false,
      path: "archived",
    });
  });

  it("dispatches ADD_TO_GROUP with payload groupUuid and resolved pk", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "ADD_TO_GROUP",
        memberId: MEMBER_ID,
        payload: { groupUuid: "group-xyz" },
      },
    });

    await executeSyncJob(prisma, job.id);

    expect(mockAddUserToGroup).toHaveBeenCalledWith("group-xyz", 42);
  });

  it("dispatches REMOVE_FROM_GROUP with payload groupUuid and resolved pk", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "REMOVE_FROM_GROUP",
        memberId: MEMBER_ID,
        payload: { groupUuid: "group-xyz" },
      },
    });

    await executeSyncJob(prisma, job.id);

    expect(mockRemoveUserFromGroup).toHaveBeenCalledWith("group-xyz", 42);
  });

  it("increments attempts on retry", async () => {
    const prisma = getTestPrisma();
    mockUpdateUser.mockResolvedValue({ pk: 42 });

    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "UPDATE_USER",
        memberId: MEMBER_ID,
        payload: { name: "X" },
      },
    });

    await executeSyncJob(prisma, job.id);
    await executeSyncJob(prisma, job.id);

    const updated = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(updated?.attempts).toBe(2);
  });
});

describe("executeSyncJob — WEBSITE target", () => {
  it("resolves the Drupal uid from the member record at execute time", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "WEBSITE",
        operation: "UPDATE_USER",
        memberId: MEMBER_ID,
        payload: { nickname: "Tesi" },
      },
    });

    const result = await executeSyncJob(prisma, job.id);

    expect(result).toEqual({ success: true, result: { userId: "9001" } });
    expect(mockUpdateWebsiteUser).toHaveBeenCalledWith("9001", {
      nickname: "Tesi",
    });
  });

  it("resolves the uid for DEACTIVATE_USER too", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "WEBSITE",
        operation: "DEACTIVATE_USER",
        memberId: MEMBER_ID,
        payload: {},
      },
    });

    await executeSyncJob(prisma, job.id);

    expect(mockDeactivateWebsiteUser).toHaveBeenCalledWith("9001");
  });

  it("persists a FAILED job when the member has no linked website account", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "WEBSITE",
        operation: "UPDATE_USER",
        memberId: UNLINKED_MEMBER_ID,
        payload: { nickname: "Newbie" },
      },
    });

    const result = await executeSyncJob(prisma, job.id);

    expect(result).toEqual({
      success: false,
      error: "Member Unlinked: nincs összekötött weboldal-fiók",
    });
    expect(mockUpdateWebsiteUser).not.toHaveBeenCalled();

    const updated = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("FAILED");
  });

  it("succeeds on retry once the uid is backfilled", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "WEBSITE",
        operation: "UPDATE_USER",
        memberId: UNLINKED_MEMBER_ID,
        payload: { nickname: "Newbie" },
      },
    });

    expect((await executeSyncJob(prisma, job.id)).success).toBe(false);

    await prisma.member.update({
      where: { id: UNLINKED_MEMBER_ID },
      data: { websiteUserId: "9042" },
    });

    const retry = await executeSyncJob(prisma, job.id);

    expect(retry.success).toBe(true);
    expect(mockUpdateWebsiteUser).toHaveBeenCalledWith("9042", {
      nickname: "Newbie",
    });
    const updated = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("SUCCESS");
    expect(updated?.attempts).toBe(2);
  });
});
