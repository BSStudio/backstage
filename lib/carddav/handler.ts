import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CARDDAV_ADDRESSBOOK_PATH,
  CARDDAV_APPLE_PRINCIPALS,
  CARDDAV_BASE,
  CARDDAV_PRINCIPAL_PATH,
  CARDDAV_ROOT_PATH,
  CARDDAV_WELL_KNOWN,
} from "@/lib/carddav/paths";
import type { AddressBook, VCard } from "@/lib/carddav/vcard";
import { buildAddressBook } from "@/lib/carddav/vcard";
import type { DavResource, PropRequest } from "@/lib/carddav/xml";
import {
  buildMultiStatus,
  escapeXml,
  parsePropRequest,
  parseReport,
} from "@/lib/carddav/xml";
import prisma from "@/lib/prisma";
import type { CardDavPrincipal } from "@/lib/services/carddav";
import {
  authenticateCardDavToken,
  listCardDavMembers,
} from "@/lib/services/carddav";

const CARD_PATTERN = new RegExp(`^${CARDDAV_BASE}/addressbook/(.+)\\.vcf$`);

// No `2`: nothing is writable, so nothing to lock. `addressbook` marks this CardDAV.
const DAV_HEADER = "1, 3, addressbook";
const ALLOW_HEADER = "OPTIONS, GET, HEAD, PROPFIND, REPORT";

type Target =
  | { kind: "root" }
  | { kind: "principal" }
  | { kind: "addressbook" }
  | { kind: "card"; id: string }
  | { kind: "unknown" };

// `handleCardDav` answers an unknown path first, so the method handlers never see one.
type KnownTarget = Exclude<Target, { kind: "unknown" }>;

function classify(pathname: string): Target {
  const path = pathname.replace(/\/+$/, "");
  if (path === CARDDAV_BASE) return { kind: "root" };
  if (
    path === `${CARDDAV_BASE}/principal` ||
    path === CARDDAV_APPLE_PRINCIPALS
  ) {
    return { kind: "principal" };
  }
  if (path === `${CARDDAV_BASE}/addressbook`) return { kind: "addressbook" };

  const card = CARD_PATTERN.exec(path);
  if (card) {
    try {
      return { kind: "card", id: decodeURIComponent(card[1]) };
    } catch {
      // A malformed percent-escape names no card, and decoding one throws out of the
      // proxy as a 500 where every other unrecognised path answers 404.
      return { kind: "unknown" };
    }
  }

  return { kind: "unknown" };
}

// ─── Responses ───────────────────────────────────────────────────────────────

function davHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("DAV", DAV_HEADER);
  return headers;
}

function unauthorized(): NextResponse {
  return new NextResponse(null, {
    status: 401,
    headers: davHeaders({
      "WWW-Authenticate": 'Basic realm="Backstage"',
    }),
  });
}

function badRequest(): NextResponse {
  return new NextResponse("Malformed request body", {
    status: 400,
    headers: davHeaders(),
  });
}

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: davHeaders() });
}

function methodNotAllowed(): NextResponse {
  return new NextResponse(null, {
    status: 405,
    headers: davHeaders({ Allow: ALLOW_HEADER }),
  });
}

function multiStatus(resources: DavResource[]): NextResponse {
  return new NextResponse(buildMultiStatus(resources), {
    status: 207,
    headers: davHeaders({ "Content-Type": "application/xml; charset=utf-8" }),
  });
}

// ─── Properties ──────────────────────────────────────────────────────────────

/** Lowercased local name to the qualified name and inner XML we answer it with. */
type PropTable = Record<string, [name: string, value: string]>;

function href(path: string): string {
  return `<d:href>${escapeXml(path)}</d:href>`;
}

function cardPath(id: string): string {
  return `${CARDDAV_ADDRESSBOOK_PATH}${encodeURIComponent(id)}.vcf`;
}

// RFC 4918 lets an href be an absolute URI, so a client is free to send back something
// other than the path we advertised. `null` for one that is not a reference at all.
function hrefPath(href: string, base: string): string | null {
  try {
    return new URL(href, base).pathname;
  } catch {
    return null;
  }
}

function resolveProps(
  table: PropTable,
  request: PropRequest,
): Record<string, string | null> {
  if (request.allprop) return Object.fromEntries(Object.values(table));

  const props: Record<string, string | null> = {};
  for (const requested of request.names) {
    const known = table[requested];
    // An unsupported property goes back under the DAV namespace whatever it was asked
    // under: only the 404 matters, and echoing the prefix would mean declaring it.
    props[known ? known[0] : `d:${requested}`] = known ? known[1] : null;
  }
  return props;
}

function rootTable(): PropTable {
  return {
    resourcetype: ["d:resourcetype", "<d:collection/>"],
    displayname: ["d:displayname", "BSS"],
    "current-user-principal": [
      "d:current-user-principal",
      href(CARDDAV_PRINCIPAL_PATH),
    ],
    "principal-url": ["d:principal-URL", href(CARDDAV_PRINCIPAL_PATH)],
    "addressbook-home-set": [
      "card:addressbook-home-set",
      href(CARDDAV_ROOT_PATH),
    ],
  };
}

function principalTable(principal: CardDavPrincipal): PropTable {
  return {
    ...rootTable(),
    resourcetype: ["d:resourcetype", "<d:collection/><d:principal/>"],
    displayname: [
      "d:displayname",
      escapeXml(`${principal.lastName} ${principal.firstName}`),
    ],
  };
}

function addressBookTable(book: AddressBook): PropTable {
  return {
    resourcetype: ["d:resourcetype", "<d:collection/><card:addressbook/>"],
    displayname: ["d:displayname", "BSS tagok"],
    getctag: ["cs:getctag", escapeXml(book.ctag)],
    "current-user-principal": [
      "d:current-user-principal",
      href(CARDDAV_PRINCIPAL_PATH),
    ],
    "supported-report-set": [
      "d:supported-report-set",
      ["addressbook-multiget", "addressbook-query"]
        .map(
          (report) =>
            `<d:supported-report><d:report><card:${report}/></d:report></d:supported-report>`,
        )
        .join(""),
    ],
    "supported-address-data": [
      "card:supported-address-data",
      '<card:address-data-type content-type="text/vcard" version="3.0"/>',
    ],
  };
}

function cardTable(card: VCard): PropTable {
  return {
    getetag: ["d:getetag", escapeXml(card.etag)],
    getcontenttype: ["d:getcontenttype", "text/vcard; charset=utf-8"],
    resourcetype: ["d:resourcetype", ""],
    "address-data": ["card:address-data", escapeXml(card.body)],
  };
}

// ─── Method handlers ─────────────────────────────────────────────────────────

function appOrigin(): string {
  const origin = process.env.APP_URL;
  if (!origin) {
    throw new Error("Missing APP_URL, needed to build CardDAV avatar URLs");
  }
  return origin;
}

async function loadAddressBook(): Promise<AddressBook> {
  return buildAddressBook(await listCardDavMembers(prisma), {
    origin: appOrigin(),
  });
}

async function handlePropfind(
  request: NextRequest,
  target: KnownTarget,
  principal: CardDavPrincipal,
): Promise<NextResponse> {
  const props = parsePropRequest(await request.text());
  if (!props) return badRequest();

  // Clients always send Depth; a shallow tree makes `infinity` the same answer as `1`.
  const deep = request.headers.get("depth") !== "0";

  if (target.kind === "principal") {
    return multiStatus([
      {
        href: CARDDAV_PRINCIPAL_PATH,
        props: resolveProps(principalTable(principal), props),
      },
    ]);
  }

  // The root's own properties are static, and a client asks for them on every sync — so
  // the book is read below it rather than ahead of it.
  if (target.kind === "root") {
    const resources: DavResource[] = [
      { href: CARDDAV_ROOT_PATH, props: resolveProps(rootTable(), props) },
    ];
    if (deep) {
      resources.push({
        href: CARDDAV_ADDRESSBOOK_PATH,
        props: resolveProps(addressBookTable(await loadAddressBook()), props),
      });
    }
    return multiStatus(resources);
  }

  const book = await loadAddressBook();

  if (target.kind === "addressbook") {
    const resources: DavResource[] = [
      {
        href: CARDDAV_ADDRESSBOOK_PATH,
        props: resolveProps(addressBookTable(book), props),
      },
    ];
    if (deep) {
      resources.push(
        ...book.cards.map((card) => ({
          href: cardPath(card.id),
          props: resolveProps(cardTable(card), props),
        })),
      );
    }
    return multiStatus(resources);
  }

  const card = book.cards.find((entry) => entry.id === target.id);
  if (!card) return notFound();

  return multiStatus([
    { href: cardPath(card.id), props: resolveProps(cardTable(card), props) },
  ]);
}

async function handleReport(request: NextRequest): Promise<NextResponse> {
  const report = parseReport(await request.text());
  if (!report) return badRequest();
  if (
    report.type !== "addressbook-multiget" &&
    report.type !== "addressbook-query"
  ) {
    return badRequest();
  }

  const book = await loadAddressBook();

  // The filter is ignored: clients use a query to enumerate, and an evaluator for it
  // would have exactly one caller.
  const selected =
    report.type === "addressbook-query"
      ? book.cards
      : // A card that is gone is left out; the next ctag comparison drops it anyway.
        report.hrefs
          .map((entry) => hrefPath(entry, request.url))
          .map((path) => book.cards.find((card) => cardPath(card.id) === path))
          .filter((card) => card !== undefined);

  return multiStatus(
    selected.map((card) => ({
      href: cardPath(card.id),
      props: resolveProps(cardTable(card), report.props),
    })),
  );
}

async function handleGet(
  target: KnownTarget,
  withBody: boolean,
): Promise<NextResponse> {
  if (target.kind !== "card") return methodNotAllowed();

  const book = await loadAddressBook();
  const card = book.cards.find((entry) => entry.id === target.id);
  if (!card) return notFound();

  return new NextResponse(withBody ? card.body : null, {
    status: 200,
    headers: davHeaders({
      "Content-Type": "text/vcard; charset=utf-8",
      ETag: card.etag,
    }),
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function readBasicToken(request: NextRequest): string | null {
  const encoded = request.headers
    .get("authorization")
    ?.match(/^Basic (.+)$/i)?.[1];
  if (!encoded) return null;

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;

  // The username is ignored: the token is the whole credential, and matching an email
  // would break every device a member owns the day a leader corrects it.
  return decoded.slice(separator + 1) || null;
}

export async function handleCardDav(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // RFC 6764 discovery. Unauthenticated on purpose: it only says where to look.
  if (pathname === CARDDAV_WELL_KNOWN) {
    return NextResponse.redirect(new URL(CARDDAV_ROOT_PATH, request.url), 301);
  }

  const token = readBasicToken(request);
  if (!token) return unauthorized();

  const principal = await authenticateCardDavToken(prisma, token);
  if (!principal) return unauthorized();

  const target = classify(pathname);
  // A 404 ends a client's hunt for a collection; a 401 reads as the password being wrong.
  if (target.kind === "unknown") return notFound();

  switch (request.method) {
    case "OPTIONS":
      return new NextResponse(null, {
        status: 204,
        headers: davHeaders({ Allow: ALLOW_HEADER }),
      });
    case "PROPFIND":
      return handlePropfind(request, target, principal);
    case "REPORT":
      return target.kind === "addressbook"
        ? handleReport(request)
        : methodNotAllowed();
    case "GET":
      return handleGet(target, true);
    case "HEAD":
      return handleGet(target, false);
    default:
      return methodNotAllowed();
  }
}
