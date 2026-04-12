import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuditDiff } from "@/components/audit-diff";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_VARIANT } from "@/lib/members";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Audit napló - Backstage" };

const PAGE_SIZE = 50;

/** Generate page numbers with ellipsis for pagination. */
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

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (session?.user.role !== "ADMIN") redirect("/");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [total, logs] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      include: {
        actor: { select: { firstName: true, lastName: true } },
        target: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit napló</h1>
        <p className="text-muted-foreground">Összesen {total} bejegyzés.</p>
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Időpont</TableHead>
              <TableHead>Művelet</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Módosító</TableHead>
              <TableHead>Változás</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Nincs bejegyzés.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("hu-HU")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={AUDIT_ACTION_VARIANT[log.action]}
                    >
                      {AUDIT_ACTION_LABELS[log.action]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <a
                      href={`/members/${log.targetId}`}
                      className="hover:underline"
                    >
                      {log.target.lastName} {log.target.firstName}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.actor ? (
                      <a
                        href={`/members/${log.actorId}`}
                        className="hover:underline"
                      >
                        {log.actor.lastName} {log.actor.firstName}
                      </a>
                    ) : (
                      (log.actorId ?? "—")
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px]">
                    <AuditDiff diff={log.diff} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={`/admin/audit?page=${Math.max(1, page - 1)}`}
              text="Előző"
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
          {pageRange(page, totalPages).map((p) =>
            p === "ellipsis-start" || p === "ellipsis-end" ? (
              <PaginationItem key={p}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationLink
                  href={`/admin/audit?page=${p}`}
                  isActive={p === page}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              href={`/admin/audit?page=${Math.min(totalPages, page + 1)}`}
              text="Következő"
              aria-disabled={page >= totalPages}
              className={
                page >= totalPages ? "pointer-events-none opacity-50" : ""
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
