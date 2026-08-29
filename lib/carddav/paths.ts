// Split from the handler so `proxy.ts` can recognise a CardDAV request without a static
// import, which would pull Prisma into every request it sees.

export const CARDDAV_BASE = "/api/carddav";
export const CARDDAV_WELL_KNOWN = "/.well-known/carddav";

export const CARDDAV_ROOT_PATH = `${CARDDAV_BASE}/`;
export const CARDDAV_PRINCIPAL_PATH = `${CARDDAV_BASE}/principal/`;
export const CARDDAV_ADDRESSBOOK_PATH = `${CARDDAV_BASE}/addressbook/`;

export function isCardDavPath(pathname: string): boolean {
  return (
    pathname === CARDDAV_WELL_KNOWN ||
    pathname === CARDDAV_BASE ||
    pathname.startsWith(CARDDAV_ROOT_PATH)
  );
}
