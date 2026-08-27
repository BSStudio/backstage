import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../../setup";

const { mockAddGroupMember, mockRemoveGroupMember } = vi.hoisted(() => ({
  mockAddGroupMember: vi.fn(),
  mockRemoveGroupMember: vi.fn(),
}));

vi.mock("@/lib/google/groups", () => ({
  addGroupMember: mockAddGroupMember,
  removeGroupMember: mockRemoveGroupMember,
}));

import {
  orchestrateAddToGoogleGroup,
  orchestrateRemoveFromGoogleGroup,
} from "@/lib/sync/google/orchestrators";
import { NO_GOOGLE_GROUP_CONFIG_REASON } from "@/lib/sync-jobs";

const MEMBER_ID = "uuid-member-1";
const EMAIL = "tag@example.com";

beforeEach(async () => {
  vi.clearAllMocks();
  mockAddGroupMember.mockResolvedValue({ added: true });
  mockRemoveGroupMember.mockResolvedValue({ removed: true });

  vi.stubEnv("GOOGLE_GROUP_EMAIL", "members@example.com");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "base64-key");

  await getTestPrisma().member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "Test",
      lastName: "Member",
      email: EMAIL,
      joinedSemester: "2025/2026/1",
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("orchestrateAddToGoogleGroup", () => {
  it("creates an ADD_TO_GROUP job and executes it", async () => {
    const prisma = getTestPrisma();

    const result = await orchestrateAddToGoogleGroup(prisma, MEMBER_ID, EMAIL);

    expect(result).toEqual({ success: true, result: { added: true } });
    expect(mockAddGroupMember).toHaveBeenCalledWith(EMAIL);

    const job = await prisma.syncJob.findFirst({
      where: { memberId: MEMBER_ID },
    });
    expect(job).toMatchObject({
      target: "GOOGLE_GROUP",
      operation: "ADD_TO_GROUP",
      status: "SUCCESS",
      attempts: 1,
      payload: { email: EMAIL },
    });
  });

  it("records a FAILED job when the API call throws", async () => {
    const prisma = getTestPrisma();
    mockAddGroupMember.mockRejectedValue(new Error("Permission denied"));

    const result = await orchestrateAddToGoogleGroup(prisma, MEMBER_ID, EMAIL);

    expect(result).toEqual({ success: false, error: "Permission denied" });
    const job = await prisma.syncJob.findFirst({
      where: { memberId: MEMBER_ID },
    });
    expect(job).toMatchObject({ status: "FAILED" });
  });
});

describe("orchestrateRemoveFromGoogleGroup", () => {
  it("creates a REMOVE_FROM_GROUP job and executes it", async () => {
    const prisma = getTestPrisma();

    const result = await orchestrateRemoveFromGoogleGroup(
      prisma,
      MEMBER_ID,
      EMAIL,
    );

    expect(result).toEqual({ success: true, result: { removed: true } });
    expect(mockRemoveGroupMember).toHaveBeenCalledWith(EMAIL);

    const job = await prisma.syncJob.findFirst({
      where: { memberId: MEMBER_ID },
    });
    expect(job).toMatchObject({
      target: "GOOGLE_GROUP",
      operation: "REMOVE_FROM_GROUP",
      status: "SUCCESS",
      payload: { email: EMAIL },
    });
  });
});

describe("without credentials", () => {
  it("skips the job instead of failing it", async () => {
    const prisma = getTestPrisma();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");

    const result = await orchestrateAddToGoogleGroup(prisma, MEMBER_ID, EMAIL);

    expect(result).toEqual({ success: true, result: null });
    expect(mockAddGroupMember).not.toHaveBeenCalled();

    const job = await prisma.syncJob.findFirst({
      where: { memberId: MEMBER_ID },
    });
    expect(job).toMatchObject({
      status: "SKIPPED",
      attempts: 0,
      result: { reason: NO_GOOGLE_GROUP_CONFIG_REASON },
    });
  });
});
