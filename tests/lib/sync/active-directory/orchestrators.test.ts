import type { Attribute } from "ldapts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubActiveDirectoryEnv } from "../../../helpers";
import { getTestPrisma } from "../../../setup";

const { mockCreate, mockReplace } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("@/lib/active-directory/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/active-directory/client")>()),
  createDirectoryUser: mockCreate,
  replaceDirectoryAttributes: mockReplace,
}));

import { ActiveDirectoryError } from "@/lib/active-directory/client";
import {
  orchestrateCreateActiveDirectoryUser,
  orchestrateSyncActiveDirectoryUser,
} from "@/lib/sync/active-directory/orchestrators";
import { executeSyncJob } from "@/lib/sync/executor";
import {
  NO_AUTHENTIK_ACCOUNT_REASON,
  NOT_CONFIGURED_REASON,
} from "@/lib/sync-jobs";

const ID = "3f0c9a1e-0000-4000-8000-000000000001";
const LOCAL_ID = "x_3f0c9a1e-0000-4000-8000-000000000002";
const DN = `CN=${ID},OU=Members,DC=studio,DC=test`;

async function jobsFor(memberId: string) {
  return getTestPrisma().syncJob.findMany({
    where: { memberId },
    orderBy: { createdAt: "asc" },
  });
}

function attributesOfCreate(): Record<string, unknown[]> {
  return Object.fromEntries(
    mockCreate.mock.calls[0][1].map((a: Attribute) => [a.type, a.values]),
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ created: true });
  mockReplace.mockResolvedValue(undefined);
  stubActiveDirectoryEnv();

  const prisma = getTestPrisma();
  for (const [id, email] of [
    [ID, "jkovacs@bsstudio.hu"],
    [LOCAL_ID, "legacy@example.com"],
  ]) {
    await prisma.member.upsert({
      where: { id },
      update: {},
      create: {
        id,
        firstName: "János",
        lastName: "Kovács",
        email,
        status: "MEMBER",
        joinedSemester: "2025/2026/1",
      },
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("orchestrateCreateActiveDirectoryUser", () => {
  it("creates the account under the member's DN and records the result", async () => {
    const result = await orchestrateCreateActiveDirectoryUser(
      getTestPrisma(),
      ID,
      "jkovacs",
    );

    expect(result).toEqual({
      success: true,
      result: { dn: DN, created: true },
    });
    const [job] = await jobsFor(ID);
    expect(job).toMatchObject({
      target: "ACTIVE_DIRECTORY",
      operation: "CREATE_USER",
      status: "SUCCESS",
      payload: { username: "jkovacs" },
      result: { dn: DN, created: true },
    });

    expect(mockCreate.mock.calls[0][0]).toBe(DN);
    expect(attributesOfCreate()).toMatchObject({
      sAMAccountName: ["jkovacs"],
      userPrincipalName: ["jkovacs@studio.test"],
      userAccountControl: ["66048"],
    });
  });

  it("records an account that already exists at the DN as not created", async () => {
    mockCreate.mockResolvedValue({ created: false });

    const result = await orchestrateCreateActiveDirectoryUser(
      getTestPrisma(),
      ID,
      "jkovacs",
    );

    expect(result).toEqual({
      success: true,
      result: { dn: DN, created: false },
    });
  });

  it("creates a disabled account for a member archived since the job was written", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "ACTIVE_DIRECTORY",
        operation: "CREATE_USER",
        memberId: ID,
        payload: { username: "jkovacs" },
      },
    });
    await prisma.member.update({
      where: { id: ID },
      data: { archived: true, archivedAt: new Date() },
    });

    await executeSyncJob(prisma, job.id);

    expect(attributesOfCreate().userAccountControl).toEqual(["66050"]);
  });

  it("fails a CREATE_USER row that carries no username", async () => {
    const prisma = getTestPrisma();
    const job = await prisma.syncJob.create({
      data: {
        target: "ACTIVE_DIRECTORY",
        operation: "CREATE_USER",
        memberId: ID,
        payload: {},
      },
    });

    const result = await executeSyncJob(prisma, job.id);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/username/),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("orchestrateSyncActiveDirectoryUser", () => {
  it("replaces names and the enabled flag", async () => {
    const result = await orchestrateSyncActiveDirectoryUser(
      getTestPrisma(),
      ID,
    );

    expect(result).toEqual({ success: true, result: { dn: DN } });
    expect(mockReplace).toHaveBeenCalledWith(DN, {
      givenName: "János",
      sn: "Kovács",
      displayName: "János Kovács",
      userAccountControl: "66048",
    });
    const [job] = await jobsFor(ID);
    expect(job).toMatchObject({
      target: "ACTIVE_DIRECTORY",
      operation: "SYNC_MEMBER",
      status: "SUCCESS",
      payload: {},
    });
  });

  it("reads the member at execute time, so an archive disables the account", async () => {
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: ID },
      data: { archived: true, archivedAt: new Date() },
    });

    await orchestrateSyncActiveDirectoryUser(prisma, ID);

    expect(mockReplace).toHaveBeenCalledWith(
      DN,
      expect.objectContaining({ userAccountControl: "66050" }),
    );
  });

  it("records an AD refusal as FAILED", async () => {
    mockReplace.mockRejectedValue(
      new ActiveDirectoryError("No Such Object Code: 0x20"),
    );

    const result = await orchestrateSyncActiveDirectoryUser(
      getTestPrisma(),
      ID,
    );

    expect(result).toEqual({
      success: false,
      error: "Active Directory error: No Such Object Code: 0x20",
    });
    const [job] = await jobsFor(ID);
    expect(job).toMatchObject({ status: "FAILED", attempts: 1 });
  });
});

describe("skipped jobs", () => {
  const runBoth = (memberId: string) =>
    Promise.all([
      orchestrateCreateActiveDirectoryUser(
        getTestPrisma(),
        memberId,
        "lmember",
      ),
      orchestrateSyncActiveDirectoryUser(getTestPrisma(), memberId),
    ]);

  it("skips a member with no Authentik account", async () => {
    const results = await runBoth(LOCAL_ID);

    expect(results).toEqual([
      { success: true, result: null },
      { success: true, result: null },
    ]);
    const jobs = await jobsFor(LOCAL_ID);
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job).toMatchObject({
        target: "ACTIVE_DIRECTORY",
        status: "SKIPPED",
        attempts: 0,
        result: { reason: NO_AUTHENTIK_ACCOUNT_REASON },
      });
    }
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("names the missing account over missing configuration", async () => {
    stubActiveDirectoryEnv({ AD_USERS_OU: "" });

    await runBoth(LOCAL_ID);

    for (const job of await jobsFor(LOCAL_ID)) {
      expect(job.result).toEqual({ reason: NO_AUTHENTIK_ACCOUNT_REASON });
    }
  });

  it("skips when AD is not configured", async () => {
    stubActiveDirectoryEnv({ AD_USERS_OU: "" });

    const results = await runBoth(ID);

    expect(results).toEqual([
      { success: true, result: null },
      { success: true, result: null },
    ]);
    const jobs = await jobsFor(ID);
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job).toMatchObject({
        status: "SKIPPED",
        attempts: 0,
        result: { reason: NOT_CONFIGURED_REASON },
      });
    }
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
