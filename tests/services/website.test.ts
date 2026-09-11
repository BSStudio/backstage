import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../setup";

const { mockPushMembers } = vi.hoisted(() => ({ mockPushMembers: vi.fn() }));

vi.mock("@/lib/website/webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/website/webhook")>()),
  pushMembers: mockPushMembers,
}));

import { ForbiddenError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import { forceWebsiteFullSync } from "@/lib/services/website";

const ADMIN: Actor = { id: "admin-id", role: "ADMIN" };
const LEADER: Actor = { id: "admin-id", role: "LEADER" };

const INGEST_RESULT = {
  mode: "replace",
  operationCount: 2,
  created: 0,
  updated: 2,
  archived: 1,
  restored: 0,
  unchanged: 0,
  ignored: 0,
};

async function seedMember(id: string, overrides: Record<string, unknown> = {}) {
  return getTestPrisma().member.create({
    data: {
      id,
      firstName: "Test",
      lastName: id,
      email: `${id}@bsstudio.hu`,
      joinedSemester: "2025/2026/1",
      ...overrides,
    },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockPushMembers.mockResolvedValue({
    ok: true,
    duplicate: false,
    result: INGEST_RESULT,
  });
  vi.stubEnv("APP_URL", "https://backstage.example.hu");
  vi.stubEnv("WEBSITE_WEBHOOK_URL", "https://example.hu/api/webhooks/members");
  vi.stubEnv("WEBSITE_WEBHOOK_TOKEN", "client-id.secret");

  await seedMember("admin-id");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("forceWebsiteFullSync", () => {
  it("refuses a leader, since this can empty the public member list", async () => {
    await expect(forceWebsiteFullSync(getTestPrisma(), LEADER)).rejects.toThrow(
      ForbiddenError,
    );
    expect(mockPushMembers).not.toHaveBeenCalled();
  });

  it("refuses rather than 500s when the webhook is unconfigured", async () => {
    vi.stubEnv("WEBSITE_WEBHOOK_TOKEN", "");

    await expect(forceWebsiteFullSync(getTestPrisma(), ADMIN)).rejects.toThrow(
      ValidationError,
    );
    expect(mockPushMembers).not.toHaveBeenCalled();
  });

  it("sends a replace payload of every member still around", async () => {
    await seedMember("kovacs", { firstName: "János", lastName: "Kovács" });

    const result = await forceWebsiteFullSync(getTestPrisma(), ADMIN);

    expect(result).toEqual({ count: 2, result: INGEST_RESULT });
    const [payload, deliveryId] = mockPushMembers.mock.calls[0];
    expect(payload.mode).toBe("replace");
    expect(payload.members.map((m: { sub: string }) => m.sub).sort()).toEqual([
      "admin-id",
      "kovacs",
    ]);
    expect(deliveryId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("leaves an archived member out, which is how the website drops them", async () => {
    await seedMember("gone", { archived: true, archivedAt: new Date() });

    const result = await forceWebsiteFullSync(getTestPrisma(), ADMIN);

    expect(result.count).toBe(1);
    const [payload] = mockPushMembers.mock.calls[0];
    expect(payload.members.map((m: { sub: string }) => m.sub)).toEqual([
      "admin-id",
    ]);
  });

  it("records the push and what the website reported", async () => {
    const prisma = getTestPrisma();

    await forceWebsiteFullSync(prisma, ADMIN);

    const entry = await prisma.auditLog.findFirst({
      where: { action: "WEBSITE_FULL_SYNC" },
    });
    expect(entry).toMatchObject({
      actorId: ADMIN.id,
      targetId: null,
      targetLabel: "Honlap",
    });
    expect(entry?.diff).toEqual({ members: 1, result: INGEST_RESULT });
  });

  it("records a duplicate answer, which carries no counts", async () => {
    mockPushMembers.mockResolvedValue({ ok: true, duplicate: true });
    const prisma = getTestPrisma();

    const result = await forceWebsiteFullSync(prisma, ADMIN);

    expect(result).toEqual({ count: 1, result: null });
    const entry = await prisma.auditLog.findFirst({
      where: { action: "WEBSITE_FULL_SYNC" },
    });
    expect(entry?.diff).toEqual({ members: 1, result: null });
  });

  it("writes no audit entry when the push is refused", async () => {
    mockPushMembers.mockRejectedValue(new Error("Website webhook error"));
    const prisma = getTestPrisma();

    await expect(forceWebsiteFullSync(prisma, ADMIN)).rejects.toThrow(
      "Website webhook error",
    );

    expect(
      await prisma.auditLog.findFirst({
        where: { action: "WEBSITE_FULL_SYNC" },
      }),
    ).toBeNull();
  });

  it("uses a fresh delivery id per push, so a second click re-pushes", async () => {
    const prisma = getTestPrisma();

    await forceWebsiteFullSync(prisma, ADMIN);
    await forceWebsiteFullSync(prisma, ADMIN);

    const [first, second] = mockPushMembers.mock.calls.map((c) => c[1]);
    expect(first).not.toBe(second);
  });
});
