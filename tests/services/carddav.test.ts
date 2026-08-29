import { beforeEach, describe, expect, it } from "vitest";
import { hashCardDavToken } from "@/lib/carddav/tokens";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import {
  createCardDavToken,
  listCardDavTokens,
  revokeCardDavToken,
} from "@/lib/services/carddav";
import { getTestPrisma } from "../setup";

const OWNER: Actor = { id: "owner-id", role: "MEMBER" };
const OTHER: Actor = { id: "other-id", role: "MEMBER" };
const LEADER: Actor = { id: "leader-id", role: "LEADER" };

beforeEach(async () => {
  await getTestPrisma().member.createMany({
    data: [OWNER, OTHER, LEADER].map((actor, index) => ({
      id: actor.id,
      firstName: "Teszt",
      lastName: `Tag${index}`,
      email: `${actor.id}@example.com`,
      joinedSemester: "2025/2026/1",
    })),
  });
});

describe("createCardDavToken", () => {
  it("returns the token once and stores only its digest", async () => {
    const prisma = getTestPrisma();

    const minted = await createCardDavToken(prisma, OWNER, OWNER.id, {
      label: "iPhone",
    });

    expect(minted.label).toBe("iPhone");
    expect(minted.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = await prisma.cardDAVToken.findUniqueOrThrow({
      where: { id: minted.id },
    });
    expect(stored.tokenHash).toBe(hashCardDavToken(minted.token));
    expect(stored.tokenHash).not.toContain(minted.token);
    expect(stored.lastUsedAt).toBeNull();
  });

  it("writes an audit entry naming the device but not the token", async () => {
    const prisma = getTestPrisma();

    const minted = await createCardDavToken(prisma, OWNER, OWNER.id, {
      label: "iPhone",
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CARDDAV_TOKEN_CREATED" },
    });
    expect(log.actorId).toBe(OWNER.id);
    expect(log.targetId).toBe(OWNER.id);
    expect(log.diff).toEqual({ label: { old: null, new: "iPhone" } });
    expect(JSON.stringify(log.diff)).not.toContain(minted.token);
  });

  it("trims the label", async () => {
    const minted = await createCardDavToken(getTestPrisma(), OWNER, OWNER.id, {
      label: "  Pixel 9  ",
    });

    expect(minted.label).toBe("Pixel 9");
  });

  it("refuses to mint for anyone but the actor, leader included", async () => {
    const prisma = getTestPrisma();

    await expect(
      createCardDavToken(prisma, LEADER, OWNER.id, { label: "iPhone" }),
    ).rejects.toThrow(ForbiddenError);
    expect(await prisma.cardDAVToken.count()).toBe(0);
  });

  it("rejects a blank label", async () => {
    await expect(
      createCardDavToken(getTestPrisma(), OWNER, OWNER.id, { label: "   " }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a label past 60 characters", async () => {
    await expect(
      createCardDavToken(getTestPrisma(), OWNER, OWNER.id, {
        label: "a".repeat(61),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an actor with no member row", async () => {
    const ghost: Actor = { id: "ghost-id", role: "MEMBER" };

    await expect(
      createCardDavToken(getTestPrisma(), ghost, ghost.id, { label: "iPhone" }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("listCardDavTokens", () => {
  it("lists newest first and never exposes a digest", async () => {
    const prisma = getTestPrisma();
    await createCardDavToken(prisma, OWNER, OWNER.id, { label: "régi" });
    await createCardDavToken(prisma, OWNER, OWNER.id, { label: "új" });

    const tokens = await listCardDavTokens(prisma, OWNER, OWNER.id);

    expect(tokens.map((token) => token.label)).toEqual(["új", "régi"]);
    expect(tokens[0]).not.toHaveProperty("tokenHash");
  });

  it("lets a leader read another member's devices", async () => {
    const prisma = getTestPrisma();
    await createCardDavToken(prisma, OWNER, OWNER.id, { label: "iPhone" });

    expect(await listCardDavTokens(prisma, LEADER, OWNER.id)).toHaveLength(1);
  });

  it("refuses another member", async () => {
    await expect(
      listCardDavTokens(getTestPrisma(), OTHER, OWNER.id),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("revokeCardDavToken", () => {
  it("deletes the row and audits the label", async () => {
    const prisma = getTestPrisma();
    const minted = await createCardDavToken(prisma, OWNER, OWNER.id, {
      label: "iPhone",
    });

    await revokeCardDavToken(prisma, OWNER, minted.id);

    expect(await prisma.cardDAVToken.count()).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CARDDAV_TOKEN_REVOKED" },
    });
    expect(log.actorId).toBe(OWNER.id);
    expect(log.targetId).toBe(OWNER.id);
    expect(log.diff).toEqual({ label: { old: "iPhone", new: null } });
  });

  it("lets a leader revoke a lost device, recording who did it", async () => {
    const prisma = getTestPrisma();
    const minted = await createCardDavToken(prisma, OWNER, OWNER.id, {
      label: "iPhone",
    });

    await revokeCardDavToken(prisma, LEADER, minted.id);

    expect(await prisma.cardDAVToken.count()).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CARDDAV_TOKEN_REVOKED" },
    });
    expect(log.actorId).toBe(LEADER.id);
    expect(log.targetId).toBe(OWNER.id);
  });

  it("refuses another member", async () => {
    const prisma = getTestPrisma();
    const minted = await createCardDavToken(prisma, OWNER, OWNER.id, {
      label: "iPhone",
    });

    await expect(revokeCardDavToken(prisma, OTHER, minted.id)).rejects.toThrow(
      ForbiddenError,
    );
    expect(await prisma.cardDAVToken.count()).toBe(1);
  });

  it("rejects an unknown token id", async () => {
    await expect(
      revokeCardDavToken(getTestPrisma(), OWNER, "no-such-token"),
    ).rejects.toThrow(NotFoundError);
  });
});
