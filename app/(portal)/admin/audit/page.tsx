import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuditDiff } from "@/components/audit-diff";
import { PageNav } from "@/components/page-nav";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_VARIANT } from "@/lib/members";
import { type Actor, canViewAdminArea } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { listAuditLogs } from "@/lib/services/audit";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Audit napló - Backstage" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  const actor: Actor = {
    id: session.user.id,
    role: session.user.role,
  };
  if (!canViewAdminArea(actor.role)) redirect("/");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { logs, total, totalPages } = await listAuditLogs(prisma, actor, {
    page,
  });

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
                    {log.target ? (
                      <a
                        href={`/members/${log.targetId}`}
                        className="hover:underline"
                      >
                        {log.target.lastName} {log.target.firstName}
                      </a>
                    ) : (
                      "—"
                    )}
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

      <PageNav basePath="/admin/audit" page={page} totalPages={totalPages} />
    </div>
  );
}
