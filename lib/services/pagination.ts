export const PAGE_SIZE = 50;

// Any page past this one makes skip exceed the safe integer range, which Prisma rejects
// outright rather than answering with an empty list.
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE);

function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(page)));
}

// The page number comes from a URL, so it can be a fraction, a huge value or not a number
// at all. A page a caller cannot express as a skip is the first one.
export function resolvePage(param: string | undefined): number {
  return clampPage(Number(param));
}

export function pageSlice(page: number) {
  return { skip: (clampPage(page) - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

// An empty table still has a first page, or the nav renders no page at all.
export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
