import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import {
  createAppLink,
  deleteAppLink,
  listAppLinks,
  moveAppLink,
  updateAppLink,
} from "@/lib/services/app-links";
import { getTestPrisma } from "../setup";

const ADMIN: Actor = { id: "admin-id", role: "ADMIN" };
const LEADER: Actor = { id: "leader-id", role: "LEADER" };
const MEMBER: Actor = { id: "member-id", role: "MEMBER" };

const VALID = {
  name: "Wiki",
  description: "Dokumentáció",
  url: "https://wiki.bsstudio.hu",
  icon: "book-open",
  accent: "TEAL",
  featured: true,
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

async function seedLinks() {
  const prisma = getTestPrisma();
  await prisma.appLink.createMany({
    data: [
      {
        id: "link-a",
        name: "Weboldal",
        url: "https://bsstudio.hu",
        icon: "globe",
        sortOrder: 0,
        featured: true,
      },
      {
        id: "link-b",
        name: "Wiki",
        url: "https://wiki.bsstudio.hu",
        icon: "book-open",
        sortOrder: 1,
      },
      {
        id: "link-c",
        name: "Felhő",
        url: "https://cloud.bsstudio.hu",
        icon: "cloud",
        sortOrder: 2,
        featured: true,
      },
    ],
  });
}

describe("listAppLinks", () => {
  it("orders by sortOrder", async () => {
    await seedLinks();
    const links = await listAppLinks(getTestPrisma());
    expect(links.map((link) => link.id)).toEqual([
      "link-a",
      "link-b",
      "link-c",
    ]);
  });

  it("falls back to the name when two links share a sortOrder", async () => {
    const prisma = getTestPrisma();
    await prisma.appLink.createMany({
      data: [
        { name: "Zebra", url: "https://z.example.com", icon: "globe" },
        { name: "Alma", url: "https://a.example.com", icon: "globe" },
      ],
    });
    const links = await listAppLinks(prisma);
    expect(links.map((link) => link.name)).toEqual(["Alma", "Zebra"]);
  });

  it("returns only the featured links when asked", async () => {
    await seedLinks();
    const links = await listAppLinks(getTestPrisma(), { featuredOnly: true });
    expect(links.map((link) => link.id)).toEqual(["link-a", "link-c"]);
  });
});

describe("createAppLink", () => {
  it("creates a link and audits it", async () => {
    const prisma = getTestPrisma();
    const created = await createAppLink(prisma, VALID, ADMIN);

    expect(created.name).toBe("Wiki");
    expect(created.accent).toBe("TEAL");
    expect(created.featured).toBe(true);
    expect(created.sortOrder).toBe(0);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("APP_LINK_CREATED");
    expect(log.actorId).toBe(ADMIN.id);
    // The entry is about no single member.
    expect(log.targetId).toBeNull();
  });

  it("defaults the accent and the featured flag", async () => {
    const created = await createAppLink(
      getTestPrisma(),
      { name: "Naptár", url: "https://calendar.google.com", icon: "calendar" },
      ADMIN,
    );
    expect(created.accent).toBe("BLUE");
    expect(created.featured).toBe(false);
    expect(created.description).toBeNull();
  });

  it("stores an emptied description as null", async () => {
    const created = await createAppLink(
      getTestPrisma(),
      { ...VALID, description: "" },
      ADMIN,
    );
    expect(created.description).toBeNull();
  });

  it("appends the new link to the end of the list", async () => {
    await seedLinks();
    const created = await createAppLink(getTestPrisma(), VALID, ADMIN);
    expect(created.sortOrder).toBe(3);
  });

  it("refuses a leader and a member", async () => {
    const prisma = getTestPrisma();
    await expect(createAppLink(prisma, VALID, LEADER)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(createAppLink(prisma, VALID, MEMBER)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects a missing name and an unknown icon", async () => {
    const prisma = getTestPrisma();
    await expect(
      createAppLink(prisma, { ...VALID, name: "  " }, ADMIN),
    ).rejects.toThrow(ValidationError);
    await expect(
      createAppLink(prisma, { ...VALID, icon: "skull" }, ADMIN),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a URL that is not http or https", async () => {
    const prisma = getTestPrisma();
    // Parses as a perfectly valid URL, and would end up in the card's href.
    await expect(
      createAppLink(prisma, { ...VALID, url: "javascript:alert(1)" }, ADMIN),
    ).rejects.toThrow(ValidationError);
    await expect(
      createAppLink(prisma, { ...VALID, url: "" }, ADMIN),
    ).rejects.toThrow(ValidationError);
  });
});

describe("updateAppLink", () => {
  it("updates changed fields and audits the diff", async () => {
    const prisma = getTestPrisma();
    await seedLinks();

    const updated = await updateAppLink(
      prisma,
      "link-b",
      { name: "Stúdió wiki", featured: true },
      ADMIN,
    );
    expect(updated.name).toBe("Stúdió wiki");
    expect(updated.featured).toBe(true);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("APP_LINK_UPDATED");
    expect(log.diff).toEqual({
      name: { old: "Wiki", new: "Stúdió wiki" },
      featured: { old: false, new: true },
    });
  });

  it("clears an emptied description", async () => {
    const prisma = getTestPrisma();
    const created = await createAppLink(prisma, VALID, ADMIN);
    const updated = await updateAppLink(
      prisma,
      created.id,
      { description: "" },
      ADMIN,
    );
    expect(updated.description).toBeNull();
  });

  it("writes nothing when the values are unchanged", async () => {
    const prisma = getTestPrisma();
    await seedLinks();

    const updated = await updateAppLink(
      prisma,
      "link-b",
      { name: "Wiki" },
      ADMIN,
    );
    expect(updated.name).toBe("Wiki");
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("throws for an unknown link", async () => {
    await expect(
      updateAppLink(getTestPrisma(), "nope", { name: "X" }, ADMIN),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses a leader", async () => {
    await seedLinks();
    await expect(
      updateAppLink(getTestPrisma(), "link-b", { name: "X" }, LEADER),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects an invalid payload", async () => {
    await seedLinks();
    await expect(
      updateAppLink(
        getTestPrisma(),
        "link-b",
        { url: "ftp://x.example" },
        ADMIN,
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("deleteAppLink", () => {
  it("deletes the link and audits its name", async () => {
    const prisma = getTestPrisma();
    await seedLinks();

    expect(await deleteAppLink(prisma, "link-b", ADMIN)).toEqual({
      deleted: true,
    });
    expect(await prisma.appLink.count()).toBe(2);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("APP_LINK_DELETED");
    expect(log.diff).toEqual({ name: { old: "Wiki", new: null } });
  });

  it("throws for an unknown link", async () => {
    await expect(deleteAppLink(getTestPrisma(), "nope", ADMIN)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("refuses a leader", async () => {
    await seedLinks();
    await expect(
      deleteAppLink(getTestPrisma(), "link-b", LEADER),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("moveAppLink", () => {
  async function order() {
    return (await listAppLinks(getTestPrisma())).map((link) => link.id);
  }

  it("moves a link up", async () => {
    await seedLinks();
    expect(await moveAppLink(getTestPrisma(), "link-c", "UP", ADMIN)).toEqual({
      moved: true,
    });
    expect(await order()).toEqual(["link-a", "link-c", "link-b"]);
  });

  it("moves a link down", async () => {
    await seedLinks();
    await moveAppLink(getTestPrisma(), "link-a", "DOWN", ADMIN);
    expect(await order()).toEqual(["link-b", "link-a", "link-c"]);
  });

  it("audits the move", async () => {
    const prisma = getTestPrisma();
    await seedLinks();
    await moveAppLink(prisma, "link-c", "UP", ADMIN);

    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("APP_LINK_UPDATED");
    expect(log.diff).toEqual({ sortOrder: { old: 2, new: 1 } });
  });

  it("renumbers a list that arrived with gaps", async () => {
    const prisma = getTestPrisma();
    await prisma.appLink.createMany({
      data: [
        {
          id: "gap-a",
          name: "A",
          url: "https://a.example.com",
          icon: "globe",
          sortOrder: 5,
        },
        {
          id: "gap-b",
          name: "B",
          url: "https://b.example.com",
          icon: "globe",
          sortOrder: 40,
        },
      ],
    });
    await moveAppLink(prisma, "gap-b", "UP", ADMIN);
    const links = await listAppLinks(prisma);
    expect(links.map((link) => [link.id, link.sortOrder])).toEqual([
      ["gap-b", 0],
      ["gap-a", 1],
    ]);
  });

  it("is a no-op at either end of the list", async () => {
    await seedLinks();
    const prisma = getTestPrisma();
    expect(await moveAppLink(prisma, "link-a", "UP", ADMIN)).toEqual({
      moved: false,
    });
    expect(await moveAppLink(prisma, "link-c", "DOWN", ADMIN)).toEqual({
      moved: false,
    });
    expect(await order()).toEqual(["link-a", "link-b", "link-c"]);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("throws for an unknown link", async () => {
    await seedLinks();
    await expect(
      moveAppLink(getTestPrisma(), "nope", "UP", ADMIN),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects an unknown direction", async () => {
    await seedLinks();
    await expect(
      moveAppLink(getTestPrisma(), "link-a", "SIDEWAYS", ADMIN),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses a leader", async () => {
    await seedLinks();
    await expect(
      moveAppLink(getTestPrisma(), "link-a", "UP", LEADER),
    ).rejects.toThrow(ForbiddenError);
  });
});
