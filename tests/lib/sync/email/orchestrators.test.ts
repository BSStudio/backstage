import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../../setup";

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));

vi.mock("@/lib/email/smtp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/smtp")>()),
  sendEmail: mockSendEmail,
}));

import { orchestrateSendWelcomeEmail } from "@/lib/sync/email/orchestrators";
import { NOT_CONFIGURED_REASON } from "@/lib/sync-jobs";

const MEMBER_ID = "uuid-member-1";

async function jobsFor(memberId: string) {
  return getTestPrisma().syncJob.findMany({ where: { memberId } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue({
    messageId: "<abc@bsstudio.hu>",
    response: "250 2.0.0 OK",
  });
  vi.stubEnv("APP_URL", "https://backstage.example.hu");
  vi.stubEnv("AUTHENTIK_URL", "https://login.example.hu");
  vi.stubEnv("SMTP_HOST", "smtp.example.hu");
  vi.stubEnv("SMTP_FROM", "BSS <noreply@example.hu>");

  await getTestPrisma().member.create({
    data: {
      id: MEMBER_ID,
      firstName: "János",
      lastName: "Kovács",
      email: "kovacs.janos@example.hu",
      mobile: "+36301234567",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      joinedSemester: "2025/2026/1",
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("orchestrateSendWelcomeEmail", () => {
  it("records the delivery and what the relay answered", async () => {
    const result = await orchestrateSendWelcomeEmail(
      getTestPrisma(),
      MEMBER_ID,
      "jkovacs",
    );

    expect(result.success).toBe(true);
    expect(await jobsFor(MEMBER_ID)).toMatchObject([
      {
        target: "EMAIL",
        operation: "SEND_WELCOME_EMAIL",
        status: "SUCCESS",
        attempts: 1,
        payload: { username: "jkovacs" },
        result: { messageId: "<abc@bsstudio.hu>", response: "250 2.0.0 OK" },
      },
    ]);
  });

  // The username is not stored anywhere, so the payload is the only thing a retry can
  // read it from.
  it("carries the username into the job row", async () => {
    await orchestrateSendWelcomeEmail(getTestPrisma(), MEMBER_ID, "jkovacs2");

    const [job] = await jobsFor(MEMBER_ID);
    expect(job?.payload).toEqual({ username: "jkovacs2" });
  });

  it.each([["SMTP_HOST"], ["SMTP_FROM"]])(
    "skips without %s instead of failing",
    async (name) => {
      vi.stubEnv(name, "");

      const result = await orchestrateSendWelcomeEmail(
        getTestPrisma(),
        MEMBER_ID,
        "jkovacs",
      );

      expect(result).toEqual({ success: true, result: null });
      expect(await jobsFor(MEMBER_ID)).toMatchObject([
        {
          target: "EMAIL",
          status: "SKIPPED",
          attempts: 0,
          result: { reason: NOT_CONFIGURED_REASON },
        },
      ]);
      expect(mockSendEmail).not.toHaveBeenCalled();
    },
  );

  it("records a relay that refused as a failed job", async () => {
    mockSendEmail.mockRejectedValue(new Error("Email error: no route to host"));

    const result = await orchestrateSendWelcomeEmail(
      getTestPrisma(),
      MEMBER_ID,
      "jkovacs",
    );

    expect(result).toEqual({
      success: false,
      error: "Email error: no route to host",
    });
    expect(await jobsFor(MEMBER_ID)).toMatchObject([
      { status: "FAILED", attempts: 1 },
    ]);
  });
});
