import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipStatus } from "@/app/generated/prisma/client";
import { hashCardDavToken } from "@/lib/carddav/tokens";
import { getTestPrisma, mockPrisma } from "../../setup";

const ORIGIN = "https://backstage.test";
const TOKEN = "a-device-token";
const OWNER_ID = "owner-id";
const OTHER_ID = "other-id";
const ARCHIVED_ID = "archived-id";
const ALUMNI_ID = "alumni-id";

const PROPFIND_BODY = `<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"
                                    xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:resourcetype/><d:displayname/><d:current-user-principal/>
    <card:addressbook-home-set/><cs:getctag/><d:getetag/><card:address-data/>
  </d:prop>
</d:propfind>`;

function member(
  id: string,
  lastName: string,
  overrides: { archived?: boolean; status?: MembershipStatus } = {},
) {
  return {
    id,
    firstName: "János",
    lastName,
    email: `${id}@example.com`,
    joinedSemester: "2025/2026/1",
    archived: false,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  mockPrisma();
  process.env.APP_URL = ORIGIN;

  const prisma = getTestPrisma();
  await prisma.member.createMany({
    data: [
      member(OWNER_ID, "Kovács"),
      member(OTHER_ID, "Nagy"),
      member(ARCHIVED_ID, "Szabó", { archived: true }),
      member(ALUMNI_ID, "Tóth", { status: "ALUMNI" }),
    ],
  });
  await prisma.cardDAVToken.create({
    data: {
      memberId: OWNER_ID,
      label: "iPhone",
      tokenHash: hashCardDavToken(TOKEN),
    },
  });
});

async function importHandler() {
  return import("@/lib/carddav/handler");
}

function basic(token: string): string {
  return `Basic ${Buffer.from(`anything:${token}`).toString("base64")}`;
}

function request(
  path: string,
  init: {
    method?: string;
    body?: string;
    depth?: string;
    authorization?: string | null;
  } = {},
): NextRequest {
  const headers = new Headers();
  const authorization =
    init.authorization === undefined ? basic(TOKEN) : init.authorization;
  if (authorization) headers.set("authorization", authorization);
  if (init.depth) headers.set("depth", init.depth);

  return new NextRequest(new URL(path, ORIGIN), {
    method: init.method ?? "PROPFIND",
    headers,
    body: init.body,
  });
}

async function call(...args: Parameters<typeof request>) {
  const { handleCardDav } = await importHandler();
  return handleCardDav(request(...args));
}

describe("discovery and authentication", () => {
  it("redirects the well-known path without asking for credentials", async () => {
    const response = await call("/.well-known/carddav", {
      method: "GET",
      authorization: null,
    });

    expect(response.status).toBe(301);
    expect(new URL(response.headers.get("location") as string).pathname).toBe(
      "/api/carddav/",
    );
  });

  it("challenges a request with no credentials", async () => {
    const response = await call("/api/carddav/", { authorization: null });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("dav")).toBe("1, 3, addressbook");
  });

  it("challenges credentials it cannot read as a token", async () => {
    for (const authorization of [
      "Bearer something",
      `Basic ${Buffer.from("no-colon-here").toString("base64")}`,
      `Basic ${Buffer.from("username:").toString("base64")}`,
    ]) {
      expect((await call("/api/carddav/", { authorization })).status).toBe(401);
    }
  });

  it("challenges an unknown token", async () => {
    const response = await call("/api/carddav/", {
      authorization: basic("not-a-real-token"),
    });

    expect(response.status).toBe(401);
  });

  it("challenges a token whose member has been archived", async () => {
    const prisma = getTestPrisma();
    await prisma.cardDAVToken.create({
      data: {
        memberId: ARCHIVED_ID,
        label: "old phone",
        tokenHash: hashCardDavToken("archived-token"),
      },
    });

    const response = await call("/api/carddav/", {
      authorization: basic("archived-token"),
    });

    expect(response.status).toBe(401);
  });

  it("ignores the username, so an email change cannot break a device", async () => {
    const authorization = `Basic ${Buffer.from(
      `someone.else@example.com:${TOKEN}`,
    ).toString("base64")}`;

    expect((await call("/api/carddav/", { authorization })).status).toBe(207);
  });

  it("records the token as used, then leaves it alone while it is fresh", async () => {
    const prisma = getTestPrisma();

    await call("/api/carddav/");
    const first = await prisma.cardDAVToken.findFirstOrThrow({
      where: { memberId: OWNER_ID },
    });
    expect(first.lastUsedAt).not.toBeNull();

    await call("/api/carddav/");
    const second = await prisma.cardDAVToken.findFirstOrThrow({
      where: { memberId: OWNER_ID },
    });
    expect(second.lastUsedAt).toEqual(first.lastUsedAt);
  });

  it("records the token as used again once the stored time is stale", async () => {
    const prisma = getTestPrisma();
    const stale = new Date(Date.now() - 60 * 60_000);
    await prisma.cardDAVToken.updateMany({
      where: { memberId: OWNER_ID },
      data: { lastUsedAt: stale },
    });

    await call("/api/carddav/");

    const token = await prisma.cardDAVToken.findFirstOrThrow({
      where: { memberId: OWNER_ID },
    });
    expect(token.lastUsedAt?.getTime()).toBeGreaterThan(stale.getTime());
  });
});

describe("routing", () => {
  it("answers a path outside the tree with 404", async () => {
    expect((await call("/api/carddav/nonsense")).status).toBe(404);
  });

  it("ends a probe aimed elsewhere on the origin with 404, never 401", async () => {
    // A 401 to a client that already authenticated reads as the password being wrong.
    for (const path of ["/", "/login", "/carddav"]) {
      expect((await call(path)).status).toBe(404);
    }
  });

  it("advertises its capabilities on OPTIONS", async () => {
    const response = await call("/api/carddav/", { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("dav")).toBe("1, 3, addressbook");
    expect(response.headers.get("allow")).toBe(
      "OPTIONS, GET, HEAD, PROPFIND, REPORT",
    );
  });

  it("refuses a method it does not implement", async () => {
    const response = await call("/api/carddav/addressbook/", {
      method: "PUT",
      body: "BEGIN:VCARD",
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toContain("PROPFIND");
  });

  it("refuses a REPORT anywhere but the address book", async () => {
    const response = await call("/api/carddav/", {
      method: "REPORT",
      body: `<card:addressbook-query xmlns:card="urn:ietf:params:xml:ns:carddav"/>`,
    });

    expect(response.status).toBe(405);
  });
});

describe("PROPFIND", () => {
  it("points the root at the principal and the home set", async () => {
    const response = await call("/api/carddav/", {
      body: PROPFIND_BODY,
      depth: "0",
    });
    const xml = await response.text();

    expect(response.status).toBe(207);
    expect(response.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(xml).toContain(
      "<d:current-user-principal><d:href>/api/carddav/principal/</d:href></d:current-user-principal>",
    );
    expect(xml).toContain(
      "<card:addressbook-home-set><d:href>/api/carddav/</d:href></card:addressbook-home-set>",
    );
    expect(xml).not.toContain("/api/carddav/addressbook/");
  });

  it("lists the address book under the root at depth 1", async () => {
    const xml = await (
      await call("/api/carddav/", { body: PROPFIND_BODY, depth: "1" })
    ).text();

    expect(xml).toContain("<d:href>/api/carddav/addressbook/</d:href>");
    expect(xml).toContain("<card:addressbook/>");
    expect(xml).toMatch(/<cs:getctag>[0-9a-f]{64}<\/cs:getctag>/);
  });

  it("names the signed-in member on the principal", async () => {
    const xml = await (
      await call("/api/carddav/principal/", { body: PROPFIND_BODY })
    ).text();

    expect(xml).toContain("<d:href>/api/carddav/principal/</d:href>");
    expect(xml).toContain("<d:displayname>Kovács János</d:displayname>");
    expect(xml).toContain("<d:principal/>");
  });

  it("answers Apple's /principals probe as the principal", async () => {
    const xml = await (
      await call("/principals", { body: PROPFIND_BODY })
    ).text();

    expect(xml).toContain("<d:principal/>");
    expect(xml).toContain("<d:displayname>Kovács János</d:displayname>");
    // It is an alias, so it still names the canonical principal URL.
    expect(xml).toContain(
      "<d:current-user-principal><d:href>/api/carddav/principal/</d:href></d:current-user-principal>",
    );
  });

  it("answers a deeper Apple principals path with 404, not the principal", async () => {
    const response = await call("/principals/users/someone/", {
      body: PROPFIND_BODY,
    });

    expect(response.status).toBe(404);
  });

  it("lists one card per member still around at depth 1", async () => {
    const xml = await (
      await call("/api/carddav/addressbook/", {
        body: PROPFIND_BODY,
        depth: "1",
      })
    ).text();

    expect(xml).toContain(`<d:href>/api/carddav/addressbook/${OWNER_ID}.vcf`);
    expect(xml).toContain(`<d:href>/api/carddav/addressbook/${OTHER_ID}.vcf`);
    expect(xml).not.toContain(ARCHIVED_ID);
    // The alumni list only grows; an active alumnus is still somebody to call.
    expect(xml).not.toContain(ALUMNI_ID);
    expect(xml.match(/<d:getetag>/g)).toHaveLength(2);
  });

  it("keeps an active alumnus in the book", async () => {
    await getTestPrisma().member.update({
      where: { id: ALUMNI_ID },
      data: { status: "ACTIVE_ALUMNI" },
    });

    const xml = await (
      await call("/api/carddav/addressbook/", {
        body: PROPFIND_BODY,
        depth: "1",
      })
    ).text();

    expect(xml).toContain(`<d:href>/api/carddav/addressbook/${ALUMNI_ID}.vcf`);
  });

  it("answers a single card with its vCard body", async () => {
    const xml = await (
      await call(`/api/carddav/addressbook/${OWNER_ID}.vcf`, {
        body: PROPFIND_BODY,
      })
    ).text();

    expect(xml).toContain("BEGIN:VCARD");
    expect(xml).toContain("FN:Kovács János");
  });

  it("answers 404 for a card that is not in the book", async () => {
    const response = await call("/api/carddav/addressbook/nobody.vcf", {
      body: PROPFIND_BODY,
    });

    expect(response.status).toBe(404);
  });

  it("returns every supported property when asked for allprop", async () => {
    const xml = await (
      await call("/api/carddav/addressbook/", {
        body: `<d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>`,
        depth: "0",
      })
    ).text();

    expect(xml).toContain("<cs:getctag>");
    expect(xml).toContain("<card:supported-address-data>");
    expect(xml).toContain("<card:addressbook-multiget/>");
    expect(xml).not.toContain("404");
  });

  it("reports a property it does not carry as 404 rather than omitting it", async () => {
    const xml = await (
      await call("/api/carddav/addressbook/", {
        body: `<d:propfind xmlns:d="DAV:"><d:prop><d:sync-token/></d:prop></d:propfind>`,
      })
    ).text();

    expect(xml).toContain(
      "<d:prop><d:sync-token/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status>",
    );
  });

  it("rejects a body that is not well-formed XML", async () => {
    const response = await call("/api/carddav/", {
      body: "<d:propfind><d:prop></d:propfind>",
    });

    expect(response.status).toBe(400);
  });
});

describe("REPORT", () => {
  const multiget = (hrefs: string[]) =>
    `<card:addressbook-multiget xmlns:d="DAV:"
                                xmlns:card="urn:ietf:params:xml:ns:carddav">
       <d:prop><d:getetag/><card:address-data/></d:prop>
       ${hrefs.map((href) => `<d:href>${href}</d:href>`).join("")}
     </card:addressbook-multiget>`;

  it("returns only the cards a multiget names", async () => {
    const xml = await (
      await call("/api/carddav/addressbook/", {
        method: "REPORT",
        body: multiget([`/api/carddav/addressbook/${OWNER_ID}.vcf`]),
      })
    ).text();

    expect(xml).toContain(`${OWNER_ID}.vcf`);
    expect(xml).not.toContain(`${OTHER_ID}.vcf`);
    expect(xml).toContain("BEGIN:VCARD");
  });

  it("leaves out an href naming a card that is gone", async () => {
    const xml = await (
      await call("/api/carddav/addressbook/", {
        method: "REPORT",
        body: multiget([
          `/api/carddav/addressbook/${OWNER_ID}.vcf`,
          "/api/carddav/addressbook/gone.vcf",
        ]),
      })
    ).text();

    expect(xml).toContain(`${OWNER_ID}.vcf`);
    expect(xml).not.toContain("gone.vcf");
  });

  it("returns the whole collection for a query", async () => {
    const xml = await (
      await call("/api/carddav/addressbook/", {
        method: "REPORT",
        body: `<card:addressbook-query xmlns:d="DAV:"
                                       xmlns:card="urn:ietf:params:xml:ns:carddav">
                 <d:prop><d:getetag/></d:prop>
               </card:addressbook-query>`,
      })
    ).text();

    expect(xml).toContain(`${OWNER_ID}.vcf`);
    expect(xml).toContain(`${OTHER_ID}.vcf`);
    expect(xml).not.toContain(ARCHIVED_ID);
  });

  it("rejects a report it does not implement", async () => {
    const response = await call("/api/carddav/addressbook/", {
      method: "REPORT",
      body: `<d:sync-collection xmlns:d="DAV:"><d:sync-token/></d:sync-collection>`,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a body that is not well-formed XML", async () => {
    const response = await call("/api/carddav/addressbook/", {
      method: "REPORT",
      body: "<card:addressbook-multiget>",
    });

    expect(response.status).toBe(400);
  });
});

describe("GET", () => {
  it("serves a card as vCard with its etag", async () => {
    const response = await call(`/api/carddav/addressbook/${OWNER_ID}.vcf`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/vcard; charset=utf-8",
    );
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(await response.text()).toContain("FN:Kovács János");
  });

  it("answers HEAD with the headers and no body", async () => {
    const response = await call(`/api/carddav/addressbook/${OWNER_ID}.vcf`, {
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(await response.text()).toBe("");
  });

  it("answers 404 for a card that is not in the book", async () => {
    const response = await call("/api/carddav/addressbook/nobody.vcf", {
      method: "GET",
    });

    expect(response.status).toBe(404);
  });

  it("refuses a GET on a collection", async () => {
    expect(
      (await call("/api/carddav/addressbook/", { method: "GET" })).status,
    ).toBe(405);
  });
});

describe("configuration", () => {
  it("fails loudly when APP_URL is unset, since avatars need an origin", async () => {
    process.env.APP_URL = "";

    await expect(
      call(`/api/carddav/addressbook/${OWNER_ID}.vcf`, { method: "GET" }),
    ).rejects.toThrow("APP_URL");
  });
});
