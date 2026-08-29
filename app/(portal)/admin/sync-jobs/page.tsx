import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { canAdminister, canViewAdminArea, toActor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { listSyncJobs } from "@/lib/services/sync-jobs";
import { getSession } from "@/lib/session";
import {
  SYNC_OPERATION_LABELS,
  SYNC_STATUS_LABELS,
  SYNC_STATUS_VARIANT,
  SYNC_TARGET_LABELS,
} from "@/lib/sync-jobs";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Szinkronizáció - Backstage" };

function formatResult(result: unknown): string {
  if (!result || typeof result !== "object") return "—";
  if ("error" in result) return String((result as { error: unknown }).error);
  if ("reason" in result) return String((result as { reason: unknown }).reason);
  return "—";
}

export default async function SyncJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  const actor = toActor(session);
  if (!canViewAdminArea(actor.role)) redirect("/");
  const canRetry = canAdminister(actor.role);

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { jobs, totalPages } = await listSyncJobs(prisma, actor, { page });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Szinkronizáció</h1>
        <p className="text-muted-foreground">
          Külső rendszerekkel végzett műveletek naplója és újrapróbálkozás.
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Cél</TableHead>
              <TableHead>Művelet</TableHead>
              <TableHead>Státusz</TableHead>
              <TableHead>Próbálkozás</TableHead>
              <TableHead>Üzenet</TableHead>
              <TableHead>Időpont</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground"
                >
                  Nincs bejegyzés.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link
                      href={`/members/${job.memberId}`}
                      className="hover:underline"
                    >
                      {job.member.lastName} {job.member.firstName}
                    </Link>
                  </TableCell>
                  <TableCell>{SYNC_TARGET_LABELS[job.target]}</TableCell>
                  <TableCell>{SYNC_OPERATION_LABELS[job.operation]}</TableCell>
                  <TableCell>
                    <Badge className={SYNC_STATUS_VARIANT[job.status]}>
                      {SYNC_STATUS_LABELS[job.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.attempts}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {formatResult(job.result)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.updatedAt.toLocaleString("hu-HU")}
                  </TableCell>
                  <TableCell>
                    {canRetry && job.status === "FAILED" && (
                      <RetryButton jobId={job.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PageNav
        basePath="/admin/sync-jobs"
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}
