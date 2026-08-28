import {
  Calendar,
  GraduationCap,
  Home,
  Mail,
  Phone,
  Shield,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AuditDiff } from "@/components/audit-diff";
import { BreadcrumbOverride } from "@/components/breadcrumb-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_VARIANT,
  STATUS_BADGE_CLASS,
} from "@/lib/members";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatSemester, MEMBERSHIP_STATUS_LABELS } from "@/types";
import { MemberAvatar } from "./member-avatar";
import { MemberEditButton } from "./member-edit-button";

const getMemberById = cache((id: string) =>
  prisma.member.findUnique({
    where: { id },
    include: {
      leadershipRole: true,
      timeline: { orderBy: { createdAt: "desc" } },
    },
  }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const member = await getMemberById(id);
  if (!member) return { title: "Tag - Backstage" };
  return { title: `${member.lastName} ${member.firstName} - Backstage` };
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const role = session?.user.role as string;
  const isLeaderOrAdmin = ["ADMIN", "LEADER"].includes(role);
  const isSelf = session?.user.id === id;
  const canEdit = isSelf || isLeaderOrAdmin;

  const member = await getMemberById(id);

  if (!member) notFound();

  const authentikGroups = isLeaderOrAdmin
    ? await prisma.authentikGroup.findMany({
        select: { authentikGroupId: true, displayName: true },
        orderBy: { displayName: "asc" },
      })
    : [];

  const auditLogs = isLeaderOrAdmin
    ? await prisma.auditLog.findMany({
        where: { targetId: id },
        include: {
          actor: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbOverride
        overrides={{ [id]: `${member.lastName} ${member.firstName}` }}
      />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <MemberAvatar
            memberId={member.id}
            firstName={member.firstName}
            lastName={member.lastName}
            avatarUrl={member.avatarUrl}
            portraitUrl={member.portraitUrl}
            canEdit={canEdit}
            isSelf={isSelf}
          />
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-bold tracking-tight">
                {member.lastName} {member.firstName}
              </h1>
              {member.nickname && (
                <span className="text-lg text-muted-foreground">
                  ({member.nickname})
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={STATUS_BADGE_CLASS[member.status]}
              >
                {MEMBERSHIP_STATUS_LABELS[member.status]}
              </Badge>
              {member.leadershipRole && (
                <Badge variant="outline" className="bg-primary/10 text-primary">
                  {member.leadershipRole.label}
                </Badge>
              )}
              {member.archived && (
                <Badge
                  variant="outline"
                  className="bg-status-archived/15 text-status-archived border-status-archived/40"
                >
                  Archivált
                </Badge>
              )}
            </div>
          </div>
        </div>
        {canEdit && (
          <MemberEditButton
            member={member}
            currentRole={
              member.leadershipRole
                ? {
                    label: member.leadershipRole.label,
                    authentikGroupIds: member.leadershipRole.authentikGroupIds,
                  }
                : null
            }
            authentikGroups={authentikGroups}
            canChangeEmail={isLeaderOrAdmin}
            canChangeStatus={isLeaderOrAdmin}
            canManageRole={isLeaderOrAdmin}
            canArchive={isLeaderOrAdmin}
          />
        )}
      </div>

      {/* Desktop: side-by-side, Mobile: stacked */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Profile */}
        <Card>
          <CardContent className="px-4">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <ProfileField
                icon={Mail}
                label="Email"
                href={`mailto:${member.email}`}
              >
                {member.email}
              </ProfileField>
              <ProfileField
                icon={Phone}
                label="Telefon"
                href={member.mobile ? `tel:${member.mobile}` : undefined}
              >
                {member.mobile}
              </ProfileField>
              <ProfileField icon={Calendar} label="Belépés">
                {formatSemester(member.joinedSemester)}
              </ProfileField>
              <ProfileField icon={Shield} label="Pozíció">
                {member.leadershipRole?.label}
              </ProfileField>
              <ProfileField icon={GraduationCap} label="Egyetem / Szak">
                {member.university && member.major
                  ? `${member.university} / ${member.major}`
                  : (member.university ?? member.major)}
              </ProfileField>
              <ProfileField icon={Home} label="Szobaszám">
                {member.dormRoom}
              </ProfileField>
            </dl>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardContent className="px-4">
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">
              Történet
            </h2>
            {member.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nincs bejegyzés.</p>
            ) : (
              <div className="relative ml-2 pl-6">
                <div className="absolute left-0 top-[10px] bottom-[10px] w-px bg-border" />
                {member.timeline.map((entry) => (
                  <div key={entry.id} className="relative mb-6 last:mb-0">
                    <div className="absolute -left-[29.7px] top-1 size-3 rounded-full border-2 border-primary bg-background" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={AUDIT_ACTION_VARIANT[entry.action]}
                        >
                          {AUDIT_ACTION_LABELS[entry.action]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString("hu-HU")}
                        </span>
                      </div>
                      {entry.status && (
                        <p className="text-sm text-muted-foreground">
                          Új státusz:{" "}
                          <span className="font-medium text-foreground">
                            {MEMBERSHIP_STATUS_LABELS[entry.status]}
                          </span>
                        </p>
                      )}
                      {entry.roleLabel && (
                        <p className="text-sm text-muted-foreground">
                          Pozíció:{" "}
                          <span className="font-medium text-foreground">
                            {entry.roleLabel}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit section (admin only) */}
      {isLeaderOrAdmin && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Audit napló</h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nincs audit bejegyzés.
            </p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Időpont</TableHead>
                    <TableHead>Művelet</TableHead>
                    <TableHead>Módosító</TableHead>
                    <TableHead>Változás</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
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
                      <TableCell className="text-sm text-muted-foreground">
                        {log.actor
                          ? `${log.actor.lastName} ${log.actor.firstName}`
                          : (log.actorId ?? "—")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <AuditDiff diff={log.diff} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileField({
  icon: Icon,
  label,
  href,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  children: React.ReactNode;
}) {
  const value = children ?? <span className="text-muted-foreground/50">—</span>;

  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-3.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm">
          {href ? (
            <a href={href} className="hover:underline">
              {value}
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}
