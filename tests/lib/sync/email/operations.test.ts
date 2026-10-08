import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../../setup";

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));

vi.mock("@/lib/email/smtp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/smtp")>()),
  sendEmail: mockSendEmail,
}));

const MEMBER_ID = "authentik-uuid-1";

async function seedMember(overrides: { archived?: boolean } = {}) {
  const prisma = getTestPrisma();
  await prisma.member.create({
    data: {
      id: MEMBER_ID,
      firstName: "János",
      lastName: "Kovács",
      email: "kovacs.janos@bsstudio.hu",
      mobile: "+36301234567",
      status: "MEMBER_CANDIDATE_CANDIDATE",
      joinedSemester: "2025/2026/1",
      archived: overrides.archived ?? false,
    },
  });
  return prisma;
}

async function run(payload: object, prisma = getTestPrisma()) {
  const { emailHandlers } = await import("@/lib/sync/email/operations");
  const handler = emailHandlers.SEND_WELCOME_EMAIL;
  if (!handler) throw new Error("SEND_WELCOME_EMAIL is not registered");
  return handler(
    payload as Record<string, unknown>,
    MEMBER_ID,
    prisma,
    "job-1",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue({
    messageId: "<abc@bsstudio.hu>",
    response: "250 2.0.0 OK",
  });
  vi.stubEnv("APP_URL", "https://backstage.bsstudio.hu");
  vi.stubEnv("AUTHENTIK_URL", "https://login.bsstudio.hu/");
  vi.stubEnv("GOOGLE_GROUP_EMAIL", "bss@simonyi.bme.hu");
});

describe("SEND_WELCOME_EMAIL", () => {
  it("sends the letter to the address the member row carries now", async () => {
    const prisma = await seedMember();

    const result = await run({ username: "jkovacs" }, prisma);

    expect(result).toMatchObject({ messageId: "<abc@bsstudio.hu>" });
    const [email] = mockSendEmail.mock.calls[0] as [
      { to: string; subject: string; html: string; text: string },
    ];
    expect(email.to).toBe("kovacs.janos@bsstudio.hu");
    expect(email.subject).toContain("Üdvözlet a stúdióban");
    expect(email.html).toContain("Szia János");
    expect(email.html).toContain("jkovacs");
  });

  // A configured trailing slash would otherwise reach an href as `…hu//`.
  it("normalises the Authentik URL and absolutises the portal link", async () => {
    const prisma = await seedMember();

    await run({ username: "jkovacs" }, prisma);

    const [{ html }] = mockSendEmail.mock.calls[0] as [{ html: string }];
    expect(html).toContain('href="https://login.bsstudio.hu"');
    expect(html).toContain('href="https://backstage.bsstudio.hu"');
    expect(html).toContain("bss@simonyi.bme.hu");
  });

  it("leaves the mailing list out when the deployment has none", async () => {
    const prisma = await seedMember();
    vi.stubEnv("GOOGLE_GROUP_EMAIL", "");

    await run({ username: "jkovacs" }, prisma);

    const [{ html }] = mockSendEmail.mock.calls[0] as [{ html: string }];
    expect(html).not.toContain("levelezőlista");
  });

  // Only reachable by retrying a letter that failed before the member was archived.
  it("refuses to welcome an archived member", async () => {
    const prisma = await seedMember({ archived: true });

    await expect(run({ username: "jkovacs" }, prisma)).rejects.toThrow(
      "Member is archived",
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ username: "" }], [{ username: 42 }]])(
    "fails on a payload with no usable username (%j)",
    async (payload) => {
      const prisma = await seedMember();

      await expect(run(payload, prisma)).rejects.toThrow("no username");
      expect(mockSendEmail).not.toHaveBeenCalled();
    },
  );

  it.each([["APP_URL"], ["AUTHENTIK_URL"]])(
    "fails when %s is not configured",
    async (name) => {
      const prisma = await seedMember();
      vi.stubEnv(name, "");

      await expect(run({ username: "jkovacs" }, prisma)).rejects.toThrow(
        /Missing (APP_URL|AUTHENTIK_URL)/,
      );
    },
  );
});
