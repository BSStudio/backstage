import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../../setup";

const { mockPushMembers } = vi.hoisted(() => ({ mockPushMembers: vi.fn() }));

vi.mock("@/lib/website/webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/website/webhook")>()),
  pushMembers: mockPushMembers,
}));

import { orchestrateSyncWebsiteMember } from "@/lib/sync/website/orchestrators";
import { NOT_CONFIGURED_REASON } from "@/lib/sync-jobs";

const MEMBER_ID = "uuid-member-1";

const PUSH_RESPONSE = {
  ok: true,
  duplicate: false,
  result: {
    mode: "operations",
    operationCount: 1,
    created: 1,
    updated: 0,
    archived: 0,
    restored: 0,
    unchanged: 0,
    ignored: 0,
  },
};

async function jobsFor(memberId: string) {
  return getTestPrisma().syncJob.findMany({
    where: { memberId },
    orderBy: { createdAt: "asc" },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockPushMembers.mockResolvedValue(PUSH_RESPONSE);
  vi.stubEnv("APP_URL", "https://backstage.example.hu");
  vi.stubEnv("WEBSITE_WEBHOOK_URL", "https://example.hu/api/webhooks/members");
  vi.stubEnv("WEBSITE_WEBHOOK_TOKEN", "client-id.secret");

  await getTestPrisma().member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "János",
      lastName: "Kovács",
      nickname: "Jani",
      email: "jkovacs@bsstudio.hu",
      status: "MEMBER",
      joinedSemester: "2025/2026/1",
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("orchestrateSyncWebsiteMember", () => {
  it("pushes an upsert and records what the website reported", async () => {
    const result = await orchestrateSyncWebsiteMember(
      getTestPrisma(),
      MEMBER_ID,
    );

    expect(result).toEqual({ success: true, result: PUSH_RESPONSE });

    const [job] = await jobsFor(MEMBER_ID);
    expect(job).toMatchObject({
      target: "WEBSITE",
      operation: "SYNC_MEMBER",
      status: "SUCCESS",
      attempts: 1,
    });
    expect(job.result).toEqual(PUSH_RESPONSE);

    expect(mockPushMembers).toHaveBeenCalledWith(
      {
        operations: [
          {
            op: "upsert",
            member: {
              sub: MEMBER_ID,
              fullName: "Kovács János",
              nickname: "Jani",
              avatarUrl: null,
              membershipStatus: "MEMBER",
              isLeadership: false,
              joinedSemester: "2025/2026/1",
            },
          },
        ],
      },
      job.id,
    );
  });

  it("uses the job id as the delivery id, so a retry cannot apply twice", async () => {
    await orchestrateSyncWebsiteMember(getTestPrisma(), MEMBER_ID);

    const [job] = await jobsFor(MEMBER_ID);
    expect(mockPushMembers.mock.calls[0][1]).toBe(job.id);
  });

  it("reads the member at execute time, so an archive since the failure wins", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: { archived: true, archivedAt: new Date() },
    });

    await orchestrateSyncWebsiteMember(prisma, MEMBER_ID);

    expect(mockPushMembers).toHaveBeenCalledWith(
      { operations: [{ op: "archive", sub: MEMBER_ID }] },
      expect.any(String),
    );
  });

  it("carries the leadership flag when the member holds a role", async () => {
    const prisma = getTestPrisma();
    await prisma.leadershipRole.create({
      data: {
        memberId: MEMBER_ID,
        label: "Főszerkesztő",
        authentikGroupIds: [],
      },
    });

    await orchestrateSyncWebsiteMember(prisma, MEMBER_ID);

    const [{ operations }] = mockPushMembers.mock.calls[0];
    expect(operations[0].member.isLeadership).toBe(true);
  });

  it("persists a FAILED job when the push is refused", async () => {
    mockPushMembers.mockRejectedValue(
      new Error("Website webhook error: sub: kötelező mező."),
    );

    const result = await orchestrateSyncWebsiteMember(
      getTestPrisma(),
      MEMBER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "Website webhook error: sub: kötelező mező.",
    });

    const [job] = await jobsFor(MEMBER_ID);
    expect(job).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it.each([["WEBSITE_WEBHOOK_URL"], ["WEBSITE_WEBHOOK_TOKEN"]])(
    "skips the job instead of failing it when %s is unset",
    async (name) => {
      vi.stubEnv(name, "");

      const result = await orchestrateSyncWebsiteMember(
        getTestPrisma(),
        MEMBER_ID,
      );

      expect(result).toEqual({ success: true, result: null });
      expect(mockPushMembers).not.toHaveBeenCalled();

      const [job] = await jobsFor(MEMBER_ID);
      expect(job).toMatchObject({
        target: "WEBSITE",
        status: "SKIPPED",
        attempts: 0,
        result: { reason: NOT_CONFIGURED_REASON },
      });
    },
  );
});
