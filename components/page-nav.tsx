import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/** Page numbers with ellipsis, e.g. 1 … 4 5 6 … 20. */
function pageRange(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [1];
  if (current > 3) pages.push("ellipsis-start");
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  ) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("ellipsis-end");
  pages.push(total);
  return pages;
}

// Prefetch is off on every link: the portal layout re-renders behind each one, so a nav
// showing nine page numbers costs nine layout renders nobody asked for.
export function PageNav({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  const isFirst = page <= 1;
  const isLast = page >= totalPages;
  const disabled = "pointer-events-none opacity-50";

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={`${basePath}?page=${Math.max(1, page - 1)}`}
            prefetch={false}
            text="Előző"
            aria-disabled={isFirst}
            tabIndex={isFirst ? -1 : undefined}
            className={isFirst ? disabled : ""}
          />
        </PaginationItem>
        {pageRange(page, totalPages).map((p) =>
          typeof p === "string" ? (
            <PaginationItem key={p}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                href={`${basePath}?page=${p}`}
                prefetch={false}
                isActive={p === page}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href={`${basePath}?page=${Math.min(totalPages, page + 1)}`}
            prefetch={false}
            text="Következő"
            aria-disabled={isLast}
            tabIndex={isLast ? -1 : undefined}
            className={isLast ? disabled : ""}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
