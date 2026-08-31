// Split from the handler so `proxy.ts` can recognise a CardDAV request without a static
// import, which would pull Prisma into every request it sees.

export const CARDDAV_BASE = "/api/carddav";
export const CARDDAV_WELL_KNOWN = "/.well-known/carddav";

// Apple clients probe this before trusting `.well-known`. An alias for the principal,
// not a tree of its own.
export const CARDDAV_APPLE_PRINCIPALS = "/principals";

export const CARDDAV_ROOT_PATH = `${CARDDAV_BASE}/`;
export const CARDDAV_PRINCIPAL_PATH = `${CARDDAV_BASE}/principal/`;
export const CARDDAV_ADDRESSBOOK_PATH = `${CARDDAV_BASE}/addressbook/`;

export function isCardDavPath(pathname: string): boolean {
  return (
    pathname === CARDDAV_WELL_KNOWN ||
    pathname === CARDDAV_BASE ||
    pathname === CARDDAV_APPLE_PRINCIPALS ||
    pathname.startsWith(CARDDAV_ROOT_PATH) ||
    pathname.startsWith(`${CARDDAV_APPLE_PRINCIPALS}/`)
  );
}

// A client hunts for a collection by aiming these anywhere, so they reach the handler
// whatever the path — a login page is not something it can read. OPTIONS is deliberately
// absent: it is also an ordinary CORS preflight.
const DAV_METHODS = new Set([
  "ACL",
  "COPY",
  "LOCK",
  "MKCALENDAR",
  "MKCOL",
  "MOVE",
  "PROPFIND",
  "PROPPATCH",
  "REPORT",
  "UNLOCK",
]);

export function isDavMethod(method: string): boolean {
  return DAV_METHODS.has(method.toUpperCase());
}
