import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cache } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/members";
import prisma from "@/lib/prisma";
import { findMemberSummary } from "@/lib/services/members";
import { formatSemester } from "@/types";

export const readOwnProfile = cache((memberId: string) =>
  findMemberSummary(prisma, memberId),
);

export async function ProfileCard({ memberId }: { memberId: string }) {
  const member = await readOwnProfile(memberId);
  if (!member) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Profilom</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-11">
            {member.avatarUrl && (
              <AvatarImage
                src={member.avatarUrl}
                alt={`${member.lastName} ${member.firstName}`}
              />
            )}
            <AvatarFallback>
              {getInitials(member.firstName, member.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-semibold leading-tight">
              {member.lastName} {member.firstName}
            </span>
            <StatusBadge status={member.status} />
          </div>
        </div>

        <dl className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Tagság kezdete</dt>
            <dd className="tabular-nums">
              {formatSemester(member.joinedSemester)}
            </dd>
          </div>
          {member.leadershipRole && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Vezetőségi pozíció</dt>
              <dd className="truncate text-right">
                {member.leadershipRole.label}
              </dd>
            </div>
          )}
        </dl>

        <Link
          href={`/members/${member.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Profil megnyitása
          <ArrowRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
