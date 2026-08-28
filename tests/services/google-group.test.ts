import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../setup";

const { mockListGroupMembers, mockIsConfigured, mockServiceAccountEmail } =
  vi.hoisted(() => ({
    mockListGroupMembers: vi.fn(),
    mockIsConfigured: vi.fn(),
    mockServiceAccountEmail: vi.fn(),
  }));

vi.mock("@/lib/google/groups", () => ({
  listGroupMembers: mockListGroupMembers,
}));

vi.mock("@/lib/google/client", () => ({
  isGoogleGroupConfigured: mockIsConfigured,
  getServiceAccountEmail: mockServiceAccountEmail,
}));

import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  annotateGoogleGroupEntry,
  getGoogleGroupReconciliation,
  refreshGoogleGroupEntries,
} from "@/lib/services/google-group";
import type { Actor } from "@/lib/services/members";

const ADMIN: Actor = { id: "admin-id", role: "ADMIN" };
const LEADER: Actor = { id: "leader-id", role: "LEADER" };
const MEMBER: Actor = { id: "member-id", role: "MEMBER" };

const ACTIVE_ID = "active-member-id";
const ARCHIVED_ID = "archived-member-id";

function member(email: string) {
  return { email, roles: ["MEMBER"] };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  mockServiceAccountEmail.mockReturnValue("groups-bot@project.iam.example.com");
  mockListGroupMembers.mockResolvedValue([]);

  const prisma = getTestPrisma();
  await prisma.member.createMany({
    data: [
      {
        id: ADMIN.id,
        firstName: "Admin",
        lastName: "Tag",
        email: "admin@example.com",
        joinedSemester: "2025/2026/1",
      },
      {
        id: ACTIVE_ID,
        firstName: "Aktív",
        lastName: "Tag",
        email: "Aktiv.Tag@example.com",
        joinedSemester: "2025/2026/1",
      },
      {
        id: ARCHIVED_ID,
        firstName: "Régi",
        lastName: "Tag",
        email: "regi.tag@example.com",
        joinedSemester: "2012/2013/1",
        archived: true,
        archivedAt: new Date(),
      },
    ],
  });
});

describe("refreshGoogleGroupEntries", () => {
  it("rejects a non-admin actor", async () => {
    await expect(
      refreshGoogleGroupEntries(getTestPrisma(), LEADER),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects when no credentials are configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    await expect(
      refreshGoogleGroupEntries(getTestPrisma(), ADMIN),
    ).rejects.toThrow(ValidationError);
  });

  it("classifies each address and ignores the service account itself", async () => {
    const prisma = getTestPrisma();
    mockListGroupMembers.mockResolvedValue([
      member("aktiv.tag@example.com"),
      member("regi.tag@example.com"),
      member("ismeretlen@example.com"),
      member("groups-bot@project.iam.example.com"),
    ]);

    const result = await refreshGoogleGroupEntries(prisma, ADMIN);
    expect(result).toEqual({ count: 3 });

    const entries = await prisma.googleGroupEntry.findMany({
      orderBy: { email: "asc" },
    });
    expect(entries).toEqual([
      expect.objectContaining({
        email: "aktiv.tag@example.com",
        matchStatus: "MATCHED",
        memberId: ACTIVE_ID,
      }),
      expect.objectContaining({
        email: "ismeretlen@example.com",
        matchStatus: "UNKNOWN",
        memberId: null,
      }),
      expect.objectContaining({
        email: "regi.tag@example.com",
        matchStatus: "ARCHIVED_ON_LIST",
        memberId: ARCHIVED_ID,
      }),
    ]);
  });

  it("records the read in the audit log as a before/after count", async () => {
    const prisma = getTestPrisma();
    await prisma.googleGroupEntry.create({
      data: { email: "lelepett@example.com", matchStatus: "UNKNOWN" },
    });
    mockListGroupMembers.mockResolvedValue([
      member("aktiv.tag@example.com"),
      member("ismeretlen@example.com"),
    ]);

    await refreshGoogleGroupEntries(prisma, ADMIN);

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "GOOGLE_GROUP_SYNCED",
      actorId: ADMIN.id,
      targetId: null,
      diff: { addresses: { old: 1, new: 2 } },
    });
  });

  it("keeps a SECONDARY_EMAIL annotation across refreshes", async () => {
    const prisma = getTestPrisma();
    await prisma.googleGroupEntry.create({
      data: {
        email: "privat@example.com",
        matchStatus: "SECONDARY_EMAIL",
        memberId: ACTIVE_ID,
        note: "Aktív Tag magáncíme",
      },
    });
    mockListGroupMembers.mockResolvedValue([member("privat@example.com")]);

    await refreshGoogleGroupEntries(prisma, ADMIN);

    const entry = await prisma.googleGroupEntry.findUnique({
      where: { email: "privat@example.com" },
    });
    expect(entry).toMatchObject({
      matchStatus: "SECONDARY_EMAIL",
      memberId: ACTIVE_ID,
      note: "Aktív Tag magáncíme",
    });
  });

  it("re-runs matching for every other status and keeps the note", async () => {
    const prisma = getTestPrisma();
    await prisma.googleGroupEntry.create({
      data: {
        email: "aktiv.tag@example.com",
        matchStatus: "UNKNOWN",
        note: "utánanézni",
      },
    });
    mockListGroupMembers.mockResolvedValue([member("aktiv.tag@example.com")]);

    await refreshGoogleGroupEntries(prisma, ADMIN);

    const entry = await prisma.googleGroupEntry.findUnique({
      where: { email: "aktiv.tag@example.com" },
    });
    expect(entry).toMatchObject({
      matchStatus: "MATCHED",
      memberId: ACTIVE_ID,
      note: "utánanézni",
    });
  });

  it("drops entries that are no longer on the list", async () => {
    const prisma = getTestPrisma();
    await prisma.googleGroupEntry.create({
      data: { email: "lelepett@example.com", matchStatus: "UNKNOWN" },
    });
    mockListGroupMembers.mockResolvedValue([member("aktiv.tag@example.com")]);

    await refreshGoogleGroupEntries(prisma, ADMIN);

    const entries = await prisma.googleGroupEntry.findMany();
    expect(entries.map((entry) => entry.email)).toEqual([
      "aktiv.tag@example.com",
    ]);
  });
});

describe("getGoogleGroupReconciliation", () => {
  it("rejects a plain member", async () => {
    await expect(
      getGoogleGroupReconciliation(getTestPrisma(), MEMBER),
    ).rejects.toThrow(ForbiddenError);
  });

  it("reports when the list was last read", async () => {
    const prisma = getTestPrisma();
    await expect(
      getGoogleGroupReconciliation(prisma, ADMIN),
    ).resolves.toMatchObject({ lastSyncedAt: null });

    mockListGroupMembers.mockResolvedValue([member("aktiv.tag@example.com")]);
    await refreshGoogleGroupEntries(prisma, ADMIN);

    const { lastSyncedAt } = await getGoogleGroupReconciliation(prisma, ADMIN);
    expect(lastSyncedAt).toBeInstanceOf(Date);
  });

  it("lets a leader read the reconciliation", async () => {
    await expect(
      getGoogleGroupReconciliation(getTestPrisma(), LEADER),
    ).resolves.toMatchObject({ entries: [] });
  });

  it("lists every member whose addresses are absent from the group", async () => {
    const prisma = getTestPrisma();
    const { missing, entries, members } = await getGoogleGroupReconciliation(
      prisma,
      ADMIN,
    );

    expect(entries).toEqual([]);
    // Archived members are listed too; the page hides them behind a checkbox.
    expect(missing.map((m) => m.id).sort()).toEqual(
      [ADMIN.id, ACTIVE_ID, ARCHIVED_ID].sort(),
    );
    // The picker offers archived members too: an address may still be theirs.
    expect(members.map((m) => m.id).sort()).toEqual(
      [ADMIN.id, ACTIVE_ID, ARCHIVED_ID].sort(),
    );
  });

  it("counts a member reachable through a secondary address as present", async () => {
    const prisma = getTestPrisma();
    await prisma.googleGroupEntry.create({
      data: {
        email: "privat@example.com",
        matchStatus: "SECONDARY_EMAIL",
        memberId: ACTIVE_ID,
      },
    });

    const { missing } = await getGoogleGroupReconciliation(prisma, ADMIN);
    expect(missing.map((m) => m.id).sort()).toEqual(
      [ADMIN.id, ARCHIVED_ID].sort(),
    );
  });
});

describe("annotateGoogleGroupEntry", () => {
  beforeEach(async () => {
    await getTestPrisma().googleGroupEntry.create({
      data: { email: "ismeretlen@example.com", matchStatus: "UNKNOWN" },
    });
  });

  it("rejects a non-admin actor", async () => {
    await expect(
      annotateGoogleGroupEntry(
        getTestPrisma(),
        "ismeretlen@example.com",
        { matchStatus: "UNKNOWN" },
        LEADER,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects a secondary address with no member", async () => {
    await expect(
      annotateGoogleGroupEntry(
        getTestPrisma(),
        "ismeretlen@example.com",
        { matchStatus: "SECONDARY_EMAIL" },
        ADMIN,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError for an address that is not on the list", async () => {
    await expect(
      annotateGoogleGroupEntry(
        getTestPrisma(),
        "nincs@example.com",
        { matchStatus: "UNKNOWN" },
        ADMIN,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("marks an address as a member's secondary one", async () => {
    const entry = await annotateGoogleGroupEntry(
      getTestPrisma(),
      "ismeretlen@example.com",
      {
        matchStatus: "SECONDARY_EMAIL",
        memberId: ACTIVE_ID,
        note: "magáncím",
      },
      ADMIN,
    );

    expect(entry).toMatchObject({
      matchStatus: "SECONDARY_EMAIL",
      memberId: ACTIVE_ID,
      note: "magáncím",
    });
  });

  it("clears the annotation back to UNKNOWN", async () => {
    const prisma = getTestPrisma();
    await prisma.googleGroupEntry.update({
      where: { email: "ismeretlen@example.com" },
      data: {
        matchStatus: "SECONDARY_EMAIL",
        memberId: ACTIVE_ID,
        note: "magáncím",
      },
    });

    const entry = await annotateGoogleGroupEntry(
      prisma,
      "ismeretlen@example.com",
      { matchStatus: "UNKNOWN" },
      ADMIN,
    );

    expect(entry).toMatchObject({
      matchStatus: "UNKNOWN",
      memberId: null,
      note: null,
    });
  });
});
