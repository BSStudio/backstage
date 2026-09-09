import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../../setup";

const {
  mockCreateDrupalUser,
  mockUpdateDrupalUser,
  mockDeactivateDrupalUser,
  mockReactivateDrupalUser,
} = vi.hoisted(() => ({
  mockCreateDrupalUser: vi.fn(),
  mockUpdateDrupalUser: vi.fn(),
  mockDeactivateDrupalUser: vi.fn(),
  mockReactivateDrupalUser: vi.fn(),
}));

vi.mock("@/lib/drupal/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/drupal/users")>()),
  createDrupalUser: mockCreateDrupalUser,
  updateDrupalUser: mockUpdateDrupalUser,
  deactivateDrupalUser: mockDeactivateDrupalUser,
  reactivateDrupalUser: mockReactivateDrupalUser,
}));

import {
  orchestrateCreateDrupalUser,
  orchestrateDeactivateDrupalUser,
  orchestrateReactivateDrupalUser,
  orchestrateUpdateDrupalUser,
} from "@/lib/sync/drupal/orchestrators";
import { NO_DRUPAL_CONFIG_REASON } from "@/lib/sync-jobs";

const MEMBER_ID = "uuid-member-1";
const DRUPAL_UID = "9001";

const CREATE_INPUT = {
  username: "jkovacs",
  fullname: "Kovács János",
  nickname: "Jani",
  email: "jkovacs@bss.hu",
  mobile: "+36301234567",
  joinedSemester: "2025/2026/1",
};

async function jobsFor(memberId: string) {
  return getTestPrisma().syncJob.findMany({
    where: { memberId },
    orderBy: { createdAt: "asc" },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("DRUPAL_URL", "https://drupal.example.com");
  vi.stubEnv("DRUPAL_ADMIN_USERNAME", "admin");
  vi.stubEnv("DRUPAL_ADMIN_PASSWORD", "s3cret");
  mockCreateDrupalUser.mockResolvedValue({
    userId: DRUPAL_UID,
    username: "jkovacs",
  });
  mockUpdateDrupalUser.mockResolvedValue(undefined);
  mockDeactivateDrupalUser.mockResolvedValue(undefined);
  mockReactivateDrupalUser.mockResolvedValue(undefined);

  await getTestPrisma().member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "János",
      lastName: "Kovács",
      email: "jkovacs@bss.hu",
      joinedSemester: "2025/2026/1",
      drupalUserId: DRUPAL_UID,
    },
  });
});

describe("orchestrateCreateDrupalUser", () => {
  it("creates a CREATE_USER job with the semester converted to a join year", async () => {
    const prisma = getTestPrisma();

    const result = await orchestrateCreateDrupalUser(
      prisma,
      MEMBER_ID,
      CREATE_INPUT,
    );

    expect(result).toEqual({
      success: true,
      result: { userId: DRUPAL_UID, username: "jkovacs" },
    });
    expect(mockCreateDrupalUser).toHaveBeenCalledWith({
      username: "jkovacs",
      fullname: "Kovács János",
      nickname: "Jani",
      email: "jkovacs@bss.hu",
      mobile: "+36301234567",
      joinYear: "2025 ősz",
    });

    const [job] = await jobsFor(MEMBER_ID);
    expect(job).toMatchObject({
      target: "DRUPAL",
      operation: "CREATE_USER",
      status: "SUCCESS",
      attempts: 1,
    });
    expect(job.result).toEqual({ userId: DRUPAL_UID, username: "jkovacs" });
  });

  it("never persists a password in the job payload", async () => {
    await orchestrateCreateDrupalUser(getTestPrisma(), MEMBER_ID, CREATE_INPUT);

    const [job] = await jobsFor(MEMBER_ID);
    // jsonb does not preserve key order, so compare as a set.
    expect(Object.keys(job.payload as object).sort()).toEqual([
      "email",
      "fullname",
      "joinYear",
      "mobile",
      "nickname",
      "username",
    ]);
  });

  it("persists a FAILED job when the Drupal create fails", async () => {
    mockCreateDrupalUser.mockRejectedValue(
      new Error("User creation failed for jkovacs"),
    );

    const result = await orchestrateCreateDrupalUser(
      getTestPrisma(),
      MEMBER_ID,
      CREATE_INPUT,
    );

    expect(result).toEqual({
      success: false,
      error: "User creation failed for jkovacs",
    });
    const [job] = await jobsFor(MEMBER_ID);
    expect(job.status).toBe("FAILED");
    expect(job.result).toEqual({ error: "User creation failed for jkovacs" });
  });
});

describe("orchestrateUpdateDrupalUser", () => {
  it("stores only the changed fields and resolves the uid from the member", async () => {
    const result = await orchestrateUpdateDrupalUser(
      getTestPrisma(),
      MEMBER_ID,
      { nickname: "Janó", position: "stúdiós" },
    );

    expect(result).toEqual({ success: true, result: { userId: DRUPAL_UID } });
    expect(mockUpdateDrupalUser).toHaveBeenCalledWith(DRUPAL_UID, {
      nickname: "Janó",
      position: "stúdiós",
    });

    const [job] = await jobsFor(MEMBER_ID);
    expect(job.operation).toBe("UPDATE_USER");
    expect(job.payload).toEqual({ nickname: "Janó", position: "stúdiós" });
  });

  it("persists a FAILED job when the Drupal update fails", async () => {
    mockUpdateDrupalUser.mockRejectedValue(
      new Error("Update BSS adatok failed for 9001"),
    );

    const result = await orchestrateUpdateDrupalUser(
      getTestPrisma(),
      MEMBER_ID,
      { position: "öregtag" },
    );

    expect(result).toEqual({
      success: false,
      error: "Update BSS adatok failed for 9001",
    });
    expect((await jobsFor(MEMBER_ID))[0].status).toBe("FAILED");
  });
});

describe("orchestrateDeactivateDrupalUser", () => {
  it("creates an empty-payload DEACTIVATE_USER job", async () => {
    const result = await orchestrateDeactivateDrupalUser(
      getTestPrisma(),
      MEMBER_ID,
    );

    expect(result).toEqual({ success: true, result: { userId: DRUPAL_UID } });
    expect(mockDeactivateDrupalUser).toHaveBeenCalledWith(DRUPAL_UID);

    const [job] = await jobsFor(MEMBER_ID);
    expect(job.operation).toBe("DEACTIVATE_USER");
    expect(job.payload).toEqual({});
  });

  it("persists a FAILED job when the Drupal deactivation fails", async () => {
    mockDeactivateDrupalUser.mockRejectedValue(
      new Error("Deactivation step 1 failed for user 9001"),
    );

    const result = await orchestrateDeactivateDrupalUser(
      getTestPrisma(),
      MEMBER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "Deactivation step 1 failed for user 9001",
    });
    expect((await jobsFor(MEMBER_ID))[0].status).toBe("FAILED");
  });
});

describe("orchestrateReactivateDrupalUser", () => {
  it("creates an empty-payload REACTIVATE_USER job", async () => {
    const result = await orchestrateReactivateDrupalUser(
      getTestPrisma(),
      MEMBER_ID,
    );

    expect(result).toEqual({ success: true, result: { userId: DRUPAL_UID } });
    expect(mockReactivateDrupalUser).toHaveBeenCalledWith(DRUPAL_UID);

    const [job] = await jobsFor(MEMBER_ID);
    expect(job.operation).toBe("REACTIVATE_USER");
    expect(job.payload).toEqual({});
  });

  it("persists a FAILED job when the Drupal reactivation fails", async () => {
    mockReactivateDrupalUser.mockRejectedValue(
      new Error("Reactivation step 1 failed for user 9001"),
    );

    const result = await orchestrateReactivateDrupalUser(
      getTestPrisma(),
      MEMBER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "Reactivation step 1 failed for user 9001",
    });
    expect((await jobsFor(MEMBER_ID))[0].status).toBe("FAILED");
  });
});

describe("without credentials", () => {
  it.each([
    ["DRUPAL_URL"],
    ["DRUPAL_ADMIN_USERNAME"],
    ["DRUPAL_ADMIN_PASSWORD"],
  ])("skips the job instead of failing it when %s is unset", async (name) => {
    const prisma = getTestPrisma();
    vi.stubEnv(name, "");

    const result = await orchestrateUpdateDrupalUser(prisma, MEMBER_ID, {
      email: "new@bss.hu",
    });

    expect(result).toEqual({ success: true, result: null });
    expect(mockUpdateDrupalUser).not.toHaveBeenCalled();

    const [job] = await jobsFor(MEMBER_ID);
    expect(job).toMatchObject({
      target: "DRUPAL",
      status: "SKIPPED",
      attempts: 0,
      result: { reason: NO_DRUPAL_CONFIG_REASON },
    });
  });

  it("skips every operation, not just the update", async () => {
    const prisma = getTestPrisma();
    vi.stubEnv("DRUPAL_URL", "");

    await orchestrateCreateDrupalUser(prisma, MEMBER_ID, CREATE_INPUT);
    await orchestrateDeactivateDrupalUser(prisma, MEMBER_ID);
    await orchestrateReactivateDrupalUser(prisma, MEMBER_ID);

    const jobs = await jobsFor(MEMBER_ID);
    expect(jobs.map((j) => [j.operation, j.status])).toEqual([
      ["CREATE_USER", "SKIPPED"],
      ["DEACTIVATE_USER", "SKIPPED"],
      ["REACTIVATE_USER", "SKIPPED"],
    ]);
    expect(mockCreateDrupalUser).not.toHaveBeenCalled();
    expect(mockDeactivateDrupalUser).not.toHaveBeenCalled();
    expect(mockReactivateDrupalUser).not.toHaveBeenCalled();
  });
});
