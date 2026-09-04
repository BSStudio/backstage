import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import {
  deleteComputer,
  listComputers,
  recordComputerPing,
} from "@/lib/services/computers";
import { getTestPrisma } from "../setup";

const ADMIN: Actor = { id: "admin-id", role: "ADMIN" };
const LEADER: Actor = { id: "leader-id", role: "LEADER" };
const MEMBER: Actor = { id: "member-id", role: "MEMBER" };

const AGENT = { sub: "agent-nle4-sub" };

const PING = {
  metadata: {
    os: "Windows 11 Pro",
    cpuPercent: 12,
    memoryPercent: 41.4,
    diskPercent: 78,
    loggedInUser: "BSS\\nkovacs",
    locked: false,
    agentVersion: "1.0.0",
  },
};

beforeEach(async () => {
  await getTestPrisma().member.create({
    data: {
      id: ADMIN.id,
      firstName: "Admin",
      lastName: "Tag",
      email: "admin@example.com",
      joinedSemester: "2025/2026/1",
    },
  });
});

describe("recordComputerPing", () => {
  it("registers a machine on its first ping", async () => {
    const prisma = getTestPrisma();

    const { computer, registered } = await recordComputerPing(
      prisma,
      "nle4",
      PING,
      AGENT,
    );

    expect(registered).toBe(true);
    expect(computer.id).toBe("nle4");
    expect(computer.agentSub).toBe(AGENT.sub);
    expect(computer.metadata).toMatchObject({ os: "Windows 11 Pro" });
    expect(await prisma.computer.count()).toBe(1);
  });

  it("replaces the metadata and reports not registered on later pings", async () => {
    const prisma = getTestPrisma();
    await recordComputerPing(prisma, "nle4", PING, AGENT);

    const { computer, registered } = await recordComputerPing(
      prisma,
      "nle4",
      { metadata: { cpuPercent: 90 } },
      AGENT,
    );

    expect(registered).toBe(false);
    expect(computer.metadata).toEqual({ cpuPercent: 90 });
    expect(await prisma.computer.count()).toBe(1);
  });

  it("moves lastSeenAt forward", async () => {
    const prisma = getTestPrisma();
    const first = await recordComputerPing(prisma, "nle4", PING, AGENT);

    const second = await recordComputerPing(prisma, "nle4", PING, AGENT);

    expect(second.computer.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      first.computer.lastSeenAt.getTime(),
    );
  });

  it("defaults metadata to an empty object", async () => {
    const { computer } = await recordComputerPing(
      getTestPrisma(),
      "nle6",
      {},
      AGENT,
    );

    expect(computer.metadata).toEqual({});
  });

  it("strips metadata keys the agent is not allowed to report", async () => {
    const { computer } = await recordComputerPing(
      getTestPrisma(),
      "nle6",
      { metadata: { cpuPercent: 5, secrets: "nope" } },
      AGENT,
    );

    expect(computer.metadata).toEqual({ cpuPercent: 5 });
  });

  it("keeps a null loggedInUser apart from an absent one", async () => {
    const prisma = getTestPrisma();

    const signedOut = await recordComputerPing(
      prisma,
      "nle4",
      { metadata: { loggedInUser: null } },
      AGENT,
    );
    const notReported = await recordComputerPing(
      prisma,
      "nle6",
      { metadata: {} },
      AGENT,
    );

    expect(signedOut.computer.metadata).toEqual({ loggedInUser: null });
    expect(notReported.computer.metadata).toEqual({});
  });

  it("records the signed-in user and whether the screen is locked", async () => {
    const { computer } = await recordComputerPing(
      getTestPrisma(),
      "nle4",
      { metadata: { loggedInUser: "BSS\\nkovacs", locked: true } },
      AGENT,
    );

    expect(computer.metadata).toEqual({
      loggedInUser: "BSS\\nkovacs",
      locked: true,
    });
  });

  it.each([
    ["an uppercase slug", "NLE4"],
    ["a slug with a slash", "nle/4"],
    ["a single character", "n"],
    ["a leading hyphen", "-nle4"],
    ["an empty string", ""],
  ])("rejects %s", async (_label, id) => {
    await expect(
      recordComputerPing(getTestPrisma(), id, PING, AGENT),
    ).rejects.toThrow(ValidationError);
  });

  it.each([
    ["no body at all", null],
    ["a body that is not an object", "nle4"],
    ["an out-of-range percentage", { metadata: { cpuPercent: 120 } }],
    ["a non-numeric percentage", { metadata: { cpuPercent: "12" } }],
  ])("rejects a ping with %s", async (_label, body) => {
    await expect(
      recordComputerPing(getTestPrisma(), "nle4", body, AGENT),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses an agent that did not claim the machine", async () => {
    const prisma = getTestPrisma();
    await recordComputerPing(prisma, "nle4", PING, AGENT);

    await expect(
      recordComputerPing(prisma, "nle4", PING, { sub: "agent-nle6-sub" }),
    ).rejects.toThrow(ForbiddenError);

    const computer = await prisma.computer.findUnique({
      where: { id: "nle4" },
    });
    expect(computer?.agentSub).toBe(AGENT.sub);
  });
});

describe("listComputers", () => {
  it("returns an empty list when nothing has registered", async () => {
    expect(await listComputers(getTestPrisma())).toEqual([]);
  });

  it("orders by id and derives the status from the ping window", async () => {
    const prisma = getTestPrisma();
    const now = new Date("2026-09-03T12:00:00Z");
    await prisma.computer.createMany({
      data: [
        {
          id: "nle7",
          agentSub: "s7",
          lastSeenAt: new Date("2026-09-03T11:00:00Z"),
          metadata: { cpuPercent: 3 },
        },
        {
          id: "nle4",
          agentSub: "s4",
          lastSeenAt: new Date("2026-09-03T11:59:00Z"),
          metadata: { os: "Windows 11 Pro" },
        },
      ],
    });

    const computers = await listComputers(prisma, now);

    expect(computers.map((c) => c.id)).toEqual(["nle4", "nle7"]);
    expect(computers[0].name).toBe("NLE4");
    expect(computers[0].status).toBe("ONLINE");
    expect(computers[0].metadata).toEqual({ os: "Windows 11 Pro" });
    expect(computers[1].status).toBe("OFFLINE");
  });

  it("survives a row whose metadata no longer matches the schema", async () => {
    const prisma = getTestPrisma();
    await prisma.computer.create({
      data: {
        id: "nle4",
        agentSub: "s4",
        lastSeenAt: new Date(),
        metadata: "not an object",
      },
    });

    const [computer] = await listComputers(prisma);

    expect(computer.metadata).toEqual({});
  });
});

describe("deleteComputer", () => {
  async function seed() {
    await getTestPrisma().computer.create({
      data: {
        id: "nle4",
        agentSub: AGENT.sub,
        lastSeenAt: new Date(),
        metadata: {},
      },
    });
  }

  it("removes the machine and writes an audit entry", async () => {
    const prisma = getTestPrisma();
    await seed();

    expect(await deleteComputer(prisma, "nle4", ADMIN)).toEqual({
      deleted: true,
    });
    expect(await prisma.computer.count()).toBe(0);

    const audit = await prisma.auditLog.findFirst();
    expect(audit).toMatchObject({
      actorId: ADMIN.id,
      targetLabel: "NLE4",
      action: "COMPUTER_DELETED",
    });
  });

  it("throws NotFoundError for an unknown machine", async () => {
    await expect(
      deleteComputer(getTestPrisma(), "nope", ADMIN),
    ).rejects.toThrow(NotFoundError);
  });

  it.each([
    ["a leader", LEADER],
    ["a member", MEMBER],
  ])("refuses %s", async (_label, actor) => {
    await seed();

    await expect(
      deleteComputer(getTestPrisma(), "nle4", actor),
    ).rejects.toThrow(ForbiddenError);
    expect(await getTestPrisma().computer.count()).toBe(1);
  });
});
