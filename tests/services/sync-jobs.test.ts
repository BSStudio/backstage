import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecuteSyncJob } = vi.hoisted(() => ({
  mockExecuteSyncJob: vi.fn(),
}));

vi.mock("@/lib/sync/executor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sync/executor")>(
    "@/lib/sync/executor",
  );
  return { ...actual, executeSyncJob: mockExecuteSyncJob };
});

import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/services/members";
import { retrySyncJob } from "@/lib/services/sync-jobs";
import { getTestPrisma } from "../setup";

const ADMIN: Actor = { id: "admin-1", role: "ADMIN" };
const LEADER: Actor = { id: "leader-1", role: "LEADER" };
const MEMBER_ID = "member-1";

beforeEach(async () => {
  vi.clearAllMocks();
  mockExecuteSyncJob.mockResolvedValue({ success: true, result: { ok: true } });

  const prisma = getTestPrisma();
  await prisma.member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "Test",
      lastName: "Member",
      email: "test@e.com",
      joinedSemester: "2025/2026/1",
    },
  });
});

describe("retrySyncJob", () => {
  it("throws ForbiddenError for non-admin actor", async () => {
    const prisma = getTestPrisma();
    await expect(retrySyncJob(prisma, "any", LEADER)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("throws NotFoundError for missing job", async () => {
    const prisma = getTestPrisma();
    await expect(retrySyncJob(prisma, "missing", ADMIN)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ValidationError for non-FAILED job", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "UPDATE_USER",
        memberId: MEMBER_ID,
        payload: {},
        status: "SUCCESS",
      },
    });
    await expect(retrySyncJob(prisma, job.id, ADMIN)).rejects.toThrow(
      ValidationError,
    );
  });

  it("calls executeSyncJob for FAILED job", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation: "UPDATE_USER",
        memberId: MEMBER_ID,
        payload: {},
        status: "FAILED",
      },
    });

    const result = await retrySyncJob(prisma, job.id, ADMIN);

    expect(result).toEqual({ success: true, result: { ok: true } });
    expect(mockExecuteSyncJob).toHaveBeenCalledTimes(1);
    expect(mockExecuteSyncJob.mock.calls[0][1]).toBe(job.id);
  });
});
