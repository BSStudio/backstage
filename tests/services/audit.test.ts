import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import { listAuditLogs, listMemberAuditLogs } from "@/lib/services/audit";
import { getTestPrisma } from "../setup";

const ADMIN: Actor = { id: "admin-1", role: "ADMIN" };
const LEADER: Actor = { id: "leader-1", role: "LEADER" };
const MEMBER: Actor = { id: "member-1", role: "MEMBER" };

const ACTOR_ID = "actor-1";
const TARGET_ID = "target-1";
const OTHER_ID = "other-1";

beforeEach(async () => {
  const prisma = getTestPrisma();
  for (const [id, lastName] of [
    [ACTOR_ID, "Actor"],
    [TARGET_ID, "Target"],
    [OTHER_ID, "Other"],
  ]) {
    await prisma.member.create({
      data: {
        id,
        firstName: "Test",
        lastName,
        email: `${id}@e.com`,
        joinedSemester: "2025/2026/1",
      },
    });
  }
});

async function log(targetId: string) {
  await getTestPrisma().auditLog.create({
    data: {
      actorId: ACTOR_ID,
      targetId,
      action: "MEMBER_UPDATED",
      diff: { mobile: { old: null, new: "+36301234567" } },
    },
  });
}

describe("listAuditLogs", () => {
  it("returns a page with both member names resolved", async () => {
    await log(TARGET_ID);

    const result = await listAuditLogs(getTestPrisma(), LEADER, { page: 1 });

    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.logs[0].actor?.lastName).toBe("Actor");
    expect(result.logs[0].target?.lastName).toBe("Target");
  });

  it("reports at least one page when there is nothing to show", async () => {
    const result = await listAuditLogs(getTestPrisma(), ADMIN, { page: 1 });

    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });

  it("throws ForbiddenError for a regular member", async () => {
    await expect(
      listAuditLogs(getTestPrisma(), MEMBER, { page: 1 }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("listMemberAuditLogs", () => {
  it("returns only the entries targeting that member", async () => {
    await log(TARGET_ID);
    await log(OTHER_ID);

    const logs = await listMemberAuditLogs(getTestPrisma(), LEADER, TARGET_ID);

    expect(logs).toHaveLength(1);
    expect(logs[0].targetId).toBe(TARGET_ID);
  });

  it("throws ForbiddenError for a regular member", async () => {
    await expect(
      listMemberAuditLogs(getTestPrisma(), MEMBER, TARGET_ID),
    ).rejects.toThrow(ForbiddenError);
  });
});
