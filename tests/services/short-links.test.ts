import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeleteKvKeys, mockListKvKeys, mockPutKvPairs } = vi.hoisted(() => ({
  mockDeleteKvKeys: vi.fn(),
  mockListKvKeys: vi.fn(),
  mockPutKvPairs: vi.fn(),
}));

vi.mock("@/lib/cloudflare/kv", (): typeof import("@/lib/cloudflare/kv") => ({
  deleteKvKeys: mockDeleteKvKeys,
  listKvKeys: mockListKvKeys,
  putKvPairs: mockPutKvPairs,
}));

import { CloudflareError } from "@/lib/cloudflare/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import {
  createShortLink,
  deleteShortLink,
  listShortLinks,
  publishShortLink,
  republishShortLinks,
  updateShortLink,
} from "@/lib/services/short-links";
import { getTestPrisma } from "../setup";

const ADMIN: Actor = { id: "admin-id", role: "ADMIN" };
const LEADER: Actor = { id: "leader-id", role: "LEADER" };
const MEMBER: Actor = { id: "member-id", role: "MEMBER" };

const VALID = {
  slug: "promo",
  url: "https://bsstudio.hu/promo",
  note: "Plakát",
};

function configured() {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct-1");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-1");
  vi.stubEnv("CLOUDFLARE_KV_NAMESPACE_ID", "ns-1");
}

function unconfigured() {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
  vi.stubEnv("CLOUDFLARE_KV_NAMESPACE_ID", "");
}

let seeded = 0;

beforeEach(async () => {
  vi.clearAllMocks();
  seeded = 0;
  mockPutKvPairs.mockResolvedValue(undefined);
  mockDeleteKvKeys.mockResolvedValue(undefined);
  mockListKvKeys.mockResolvedValue([]);
  configured();
  vi.stubEnv("SHORT_LINK_BASE_URL", "https://l.example.hu");

  await getTestPrisma().member.createMany({
    data: [ADMIN, LEADER, MEMBER].map((actor) => ({
      id: actor.id,
      firstName: "Teszt",
      lastName: actor.role,
      email: `${actor.role.toLowerCase()}@test.com`,
      joinedSemester: "2025/2026/1",
    })),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// createdAt is stepped so the ordering assertions cannot tie.
async function seed(slug: string, url = "https://bsstudio.hu/a") {
  seeded += 1;
  return getTestPrisma().shortLink.create({
    data: {
      slug,
      url,
      createdById: ADMIN.id,
      createdAt: new Date(2026, 0, seeded),
    },
  });
}

describe("listShortLinks", () => {
  it("returns the newest first", async () => {
    const prisma = getTestPrisma();
    await seed("old", "https://bsstudio.hu/o");
    await seed("new", "https://bsstudio.hu/n");

    const links = await listShortLinks(prisma, LEADER);

    expect(links.map((link) => link.slug)).toEqual(["new", "old"]);
  });

  it("refuses an ordinary member", async () => {
    await expect(listShortLinks(getTestPrisma(), MEMBER)).rejects.toThrow(
      "Forbidden",
    );
  });
});

describe("createShortLink", () => {
  it("saves the link and audits it against the slug", async () => {
    const prisma = getTestPrisma();

    const { link, syncErrors } = await createShortLink(prisma, VALID, LEADER);

    expect(link.slug).toBe("promo");
    expect(link.createdById).toBe(LEADER.id);
    expect(link.publishedAt).not.toBeNull();
    expect(syncErrors).toEqual([]);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("SHORT_LINK_CREATED");
    expect(log.targetId).toBeNull();
    expect(log.targetLabel).toBe("promo");
  });

  it("pushes the target to KV", async () => {
    await createShortLink(getTestPrisma(), VALID, ADMIN);

    expect(mockPutKvPairs).toHaveBeenCalledWith([
      { key: "promo", value: "https://bsstudio.hu/promo" },
    ]);
  });

  it("lowercases the slug", async () => {
    const { link } = await createShortLink(
      getTestPrisma(),
      { ...VALID, slug: "PROMO" },
      ADMIN,
    );

    expect(link.slug).toBe("promo");
  });

  it("stores a blank note as null", async () => {
    const { link } = await createShortLink(
      getTestPrisma(),
      { ...VALID, note: "  " },
      ADMIN,
    );

    expect(link.note).toBeNull();
  });

  it("refuses an ordinary member", async () => {
    await expect(
      createShortLink(getTestPrisma(), VALID, MEMBER),
    ).rejects.toThrow("Forbidden");
  });

  it("refuses a slug already taken", async () => {
    await seed("promo");

    await expect(
      createShortLink(getTestPrisma(), VALID, ADMIN),
    ).rejects.toThrow(ValidationError);
    expect(mockPutKvPairs).not.toHaveBeenCalled();
  });

  it.each([
    ["-lead", "a leading hyphen"],
    ["a", "one character"],
    ["pro mo", "a space"],
    ["pro.mo", "a dot"],
  ])("refuses the slug %p because of %s", async (slug) => {
    await expect(
      createShortLink(getTestPrisma(), { ...VALID, slug }, ADMIN),
    ).rejects.toThrow(ValidationError);
  });

  it.each(["javascript:alert(1)", "ftp://example.hu", ""])(
    "refuses the target %p",
    async (url) => {
      await expect(
        createShortLink(getTestPrisma(), { ...VALID, url }, ADMIN),
      ).rejects.toThrow(ValidationError);
    },
  );

  it("refuses a target on the short host itself", async () => {
    await expect(
      createShortLink(
        getTestPrisma(),
        { ...VALID, url: "https://l.example.hu/gala" },
        ADMIN,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("saves as unpublished when Cloudflare is unconfigured", async () => {
    unconfigured();

    const { link, syncErrors } = await createShortLink(
      getTestPrisma(),
      VALID,
      ADMIN,
    );

    expect(link.publishedAt).toBeNull();
    expect(syncErrors).toEqual([]);
    expect(mockPutKvPairs).not.toHaveBeenCalled();
  });

  it("reports a refused push and leaves the row unpublished", async () => {
    mockPutKvPairs.mockRejectedValue(
      new CloudflareError(429, { message: "Too many requests" }),
    );

    const { syncErrors } = await createShortLink(getTestPrisma(), VALID, ADMIN);

    expect(syncErrors).toEqual(["Cloudflare API error: Too many requests"]);
    const saved = await getTestPrisma().shortLink.findUniqueOrThrow({
      where: { slug: "promo" },
    });
    expect(saved.publishedAt).toBeNull();
  });

  it("rethrows a failure the integration did not raise", async () => {
    mockPutKvPairs.mockRejectedValue(new Error("boom"));

    await expect(
      createShortLink(getTestPrisma(), VALID, ADMIN),
    ).rejects.toThrow("boom");
  });
});

describe("updateShortLink", () => {
  it("retargets the link, audits the diff and pushes", async () => {
    const prisma = getTestPrisma();
    await seed("promo");

    const { link, syncErrors } = await updateShortLink(
      prisma,
      "promo",
      { url: "https://bsstudio.hu/b" },
      LEADER,
    );

    expect(link.url).toBe("https://bsstudio.hu/b");
    expect(syncErrors).toEqual([]);
    expect(mockPutKvPairs).toHaveBeenCalledWith([
      { key: "promo", value: "https://bsstudio.hu/b" },
    ]);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("SHORT_LINK_UPDATED");
    expect(log.diff).toEqual({
      url: { old: "https://bsstudio.hu/a", new: "https://bsstudio.hu/b" },
    });
  });

  it("writes nothing when nothing changed", async () => {
    const prisma = getTestPrisma();
    await seed("promo");

    const { syncErrors } = await updateShortLink(
      prisma,
      "promo",
      { url: "https://bsstudio.hu/a" },
      ADMIN,
    );

    expect(syncErrors).toEqual([]);
    expect(await prisma.auditLog.count()).toBe(0);
    expect(mockPutKvPairs).not.toHaveBeenCalled();
  });

  it("does not push when only the note changed", async () => {
    const prisma = getTestPrisma();
    await seed("promo");

    await updateShortLink(prisma, "promo", { note: "Csak jegyzet" }, ADMIN);

    expect(await prisma.auditLog.count()).toBe(1);
    expect(mockPutKvPairs).not.toHaveBeenCalled();
  });

  it("clears a note given as blank", async () => {
    const prisma = getTestPrisma();
    await prisma.shortLink.create({
      data: {
        slug: "promo",
        url: "https://bsstudio.hu/a",
        note: "Régi",
        createdById: ADMIN.id,
      },
    });

    const { link } = await updateShortLink(
      prisma,
      "promo",
      { note: "" },
      ADMIN,
    );

    expect(link.note).toBeNull();
  });

  it("refuses an unknown slug", async () => {
    await expect(
      updateShortLink(getTestPrisma(), "nope", { note: "x" }, ADMIN),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses an ordinary member", async () => {
    await seed("promo");

    await expect(
      updateShortLink(getTestPrisma(), "promo", { note: "x" }, MEMBER),
    ).rejects.toThrow("Forbidden");
  });

  it("refuses a javascript: target", async () => {
    await seed("promo");

    await expect(
      updateShortLink(
        getTestPrisma(),
        "promo",
        { url: "javascript:alert(1)" },
        ADMIN,
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("deleteShortLink", () => {
  it("removes the row, audits it and takes the key out of KV", async () => {
    const prisma = getTestPrisma();
    await seed("promo");

    const result = await deleteShortLink(prisma, "promo", LEADER);

    expect(result).toEqual({ deleted: true, syncErrors: [] });
    expect(await prisma.shortLink.count()).toBe(0);
    expect(mockDeleteKvKeys).toHaveBeenCalledWith(["promo"]);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("SHORT_LINK_DELETED");
    expect(log.diff).toEqual({
      url: { old: "https://bsstudio.hu/a", new: null },
    });
  });

  it("skips KV when Cloudflare is unconfigured", async () => {
    unconfigured();
    await seed("promo");

    await deleteShortLink(getTestPrisma(), "promo", ADMIN);

    expect(mockDeleteKvKeys).not.toHaveBeenCalled();
  });

  it("reports a refused removal as a sync error", async () => {
    mockDeleteKvKeys.mockRejectedValue(
      new CloudflareError(500, { message: "Upstream" }),
    );
    await seed("promo");

    const { syncErrors } = await deleteShortLink(
      getTestPrisma(),
      "promo",
      ADMIN,
    );

    expect(syncErrors).toEqual(["Cloudflare API error: Upstream"]);
  });

  it("rethrows a failure the integration did not raise", async () => {
    mockDeleteKvKeys.mockRejectedValue(new Error("boom"));
    await seed("promo");

    await expect(
      deleteShortLink(getTestPrisma(), "promo", ADMIN),
    ).rejects.toThrow("boom");
  });

  it("refuses an unknown slug", async () => {
    await expect(
      deleteShortLink(getTestPrisma(), "nope", ADMIN),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses an ordinary member", async () => {
    await seed("promo");

    await expect(
      deleteShortLink(getTestPrisma(), "promo", MEMBER),
    ).rejects.toThrow("Forbidden");
  });
});

describe("publishShortLink", () => {
  it("pushes again and records that it landed, without a new audit entry", async () => {
    const prisma = getTestPrisma();
    await seed("promo");

    const { link, syncErrors } = await publishShortLink(
      prisma,
      "promo",
      LEADER,
    );

    expect(syncErrors).toEqual([]);
    expect(link.publishedAt).not.toBeNull();
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("leaves the row alone when the push is refused", async () => {
    mockPutKvPairs.mockRejectedValue(
      new CloudflareError(429, { message: "Too many requests" }),
    );
    await seed("promo");

    const { link, syncErrors } = await publishShortLink(
      getTestPrisma(),
      "promo",
      ADMIN,
    );

    expect(syncErrors).toEqual(["Cloudflare API error: Too many requests"]);
    expect(link.publishedAt).toBeNull();
  });

  it("refuses an unknown slug", async () => {
    await expect(
      publishShortLink(getTestPrisma(), "nope", ADMIN),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses an ordinary member", async () => {
    await seed("promo");

    await expect(
      publishShortLink(getTestPrisma(), "promo", MEMBER),
    ).rejects.toThrow("Forbidden");
  });
});

describe("republishShortLinks", () => {
  it("pushes every link, drops strays and audits the counts", async () => {
    const prisma = getTestPrisma();
    await seed("promo");
    await seed("gala", "https://bsstudio.hu/g");
    mockListKvKeys.mockResolvedValue(["promo", "leftover"]);

    const result = await republishShortLinks(prisma, ADMIN);

    expect(result).toEqual({ links: 2, removed: 1 });
    expect(mockPutKvPairs).toHaveBeenCalledWith([
      { key: "promo", value: "https://bsstudio.hu/a" },
      { key: "gala", value: "https://bsstudio.hu/g" },
    ]);
    expect(mockDeleteKvKeys).toHaveBeenCalledWith(["leftover"]);

    const links = await prisma.shortLink.findMany();
    expect(links.every((link) => link.publishedAt !== null)).toBe(true);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("SHORT_LINK_FULL_SYNC");
    expect(log.targetId).toBeNull();
    expect(log.diff).toEqual({ links: 2, removed: 1 });
  });

  it("writes no audit entry when the push is refused", async () => {
    const prisma = getTestPrisma();
    await seed("promo");
    mockPutKvPairs.mockRejectedValue(
      new CloudflareError(403, { message: "Forbidden by token" }),
    );

    await expect(republishShortLinks(prisma, ADMIN)).rejects.toThrow(
      "Cloudflare API error: Forbidden by token",
    );
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("refuses a leader", async () => {
    await expect(republishShortLinks(getTestPrisma(), LEADER)).rejects.toThrow(
      "Forbidden",
    );
  });

  it("refuses when Cloudflare is unconfigured", async () => {
    unconfigured();

    await expect(republishShortLinks(getTestPrisma(), ADMIN)).rejects.toThrow(
      ValidationError,
    );
    expect(mockListKvKeys).not.toHaveBeenCalled();
  });
});
