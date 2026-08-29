export const PAGE_SIZE = 50;

export function pageSlice(page: number) {
  return { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

// An empty table still has a first page, or the nav renders no page at all.
export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
