import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestPrisma } from "../../../setup";

const {
  mockCreateWebsiteUser,
  mockUpdateWebsiteUser,
  mockDeactivateWebsiteUser,
} = vi.hoisted(() => ({
  mockCreateWebsiteUser: vi.fn(),
  mockUpdateWebsiteUser: vi.fn(),
  mockDeactivateWebsiteUser: vi.fn(),
}));

vi.mock("@/lib/website/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/website/users")>()),
  createWebsiteUser: mockCreateWebsiteUser,
  updateWebsiteUser: mockUpdateWebsiteUser,
  deactivateWebsiteUser: mockDeactivateWebsiteUser,
}));

import {
  orchestrateCreateWebsiteUser,
  orchestrateDeactivateWebsiteUser,
  orchestrateUpdateWebsiteUser,
} from "@/lib/sync/website/orchestrators";

const MEMBER_ID = "uuid-member-1";
const WEBSITE_UID = "9001";

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
  mockCreateWebsiteUser.mockResolvedValue({
    userId: WEBSITE_UID,
    username: "jkovacs",
  });
  mockUpdateWebsiteUser.mockResolvedValue(undefined);
  mockDeactivateWebsiteUser.mockResolvedValue(undefined);

  await getTestPrisma().member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "János",
      lastName: "Kovács",
      email: "jkovacs@bss.hu",
      joinedSemester: "2025/2026/1",
      websiteUserId: WEBSITE_UID,
    },
  });
});

describe("orchestrateCreateWebsiteUser", () => {
  it("creates a CREATE_USER job with the semester converted to a join year", async () => {
    const prisma = getTestPrisma();

    const result = await orchestrateCreateWebsiteUser(
      prisma,
      MEMBER_ID,
      CREATE_INPUT,
    );

    expect(result).toEqual({
      success: true,
      result: { userId: WEBSITE_UID, username: "jkovacs" },
    });
    expect(mockCreateWebsiteUser).toHaveBeenCalledWith({
      username: "jkovacs",
      fullname: "Kovács János",
      nickname: "Jani",
      email: "jkovacs@bss.hu",
      mobile: "+36301234567",
      joinYear: "2025 ősz",
    });

    const [job] = await jobsFor(MEMBER_ID);
    expect(job).toMatchObject({
      target: "WEBSITE",
      operation: "CREATE_USER",
      status: "SUCCESS",
      attempts: 1,
    });
    expect(job.result).toEqual({ userId: WEBSITE_UID, username: "jkovacs" });
  });

  it("never persists a password in the job payload", async () => {
    await orchestrateCreateWebsiteUser(
      getTestPrisma(),
      MEMBER_ID,
      CREATE_INPUT,
    );

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
    mockCreateWebsiteUser.mockRejectedValue(
      new Error("User creation failed for jkovacs"),
    );

    const result = await orchestrateCreateWebsiteUser(
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

describe("orchestrateUpdateWebsiteUser", () => {
  it("stores only the changed fields and resolves the uid from the member", async () => {
    const result = await orchestrateUpdateWebsiteUser(
      getTestPrisma(),
      MEMBER_ID,
      { nickname: "Janó", position: "stúdiós" },
    );

    expect(result).toEqual({ success: true, result: { userId: WEBSITE_UID } });
    expect(mockUpdateWebsiteUser).toHaveBeenCalledWith(WEBSITE_UID, {
      nickname: "Janó",
      position: "stúdiós",
    });

    const [job] = await jobsFor(MEMBER_ID);
    expect(job.operation).toBe("UPDATE_USER");
    expect(job.payload).toEqual({ nickname: "Janó", position: "stúdiós" });
  });

  it("persists a FAILED job when the Drupal update fails", async () => {
    mockUpdateWebsiteUser.mockRejectedValue(
      new Error("Update BSS adatok failed for 9001"),
    );

    const result = await orchestrateUpdateWebsiteUser(
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

describe("orchestrateDeactivateWebsiteUser", () => {
  it("creates an empty-payload DEACTIVATE_USER job", async () => {
    const result = await orchestrateDeactivateWebsiteUser(
      getTestPrisma(),
      MEMBER_ID,
    );

    expect(result).toEqual({ success: true, result: { userId: WEBSITE_UID } });
    expect(mockDeactivateWebsiteUser).toHaveBeenCalledWith(WEBSITE_UID);

    const [job] = await jobsFor(MEMBER_ID);
    expect(job.operation).toBe("DEACTIVATE_USER");
    expect(job.payload).toEqual({});
  });

  it("persists a FAILED job when the Drupal deactivation fails", async () => {
    mockDeactivateWebsiteUser.mockRejectedValue(
      new Error("Deactivation step 1 failed for user 9001"),
    );

    const result = await orchestrateDeactivateWebsiteUser(
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
