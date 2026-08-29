import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { canManageMembers } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { pageActor } from "@/lib/session";
import { MembersTable } from "./members-table";

export const metadata: Metadata = { title: "Aktív tagok - Backstage" };

export default async function MembersPage() {
  const actor = await pageActor();
  const canManage = canManageMembers(actor.role);
  const members = await prisma.member.findMany({
    where: {
      archived: false,
      status: {
        in: [
          "MEMBER_CANDIDATE_CANDIDATE",
          "MEMBER_CANDIDATE",
          "MEMBER",
          "ACTIVE_ALUMNI",
        ],
      },
    },
    include: {
      leadershipRole: true,
    },
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Aktív tagok</h1>
          <p className="text-muted-foreground">{members.length} aktív tag.</p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/members/new">
              <Plus className="mr-2 size-4" />
              Új tag
            </Link>
          </Button>
        )}
      </div>

      <MembersTable members={members} canManage={canManage} />
    </div>
  );
}
