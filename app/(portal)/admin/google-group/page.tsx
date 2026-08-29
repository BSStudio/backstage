import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { googleGroupUrl } from "@/lib/google-group";
import { type Actor, canAdminister, canViewAdminArea } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { getGoogleGroupReconciliation } from "@/lib/services/google-group";
import { getSession } from "@/lib/session";
import { EntriesTable } from "./entries-table";
import { MissingTable } from "./missing-table";
import { RefreshButton } from "./refresh-button";

export const metadata: Metadata = { title: "Google Group - Backstage" };

export default async function GoogleGroupPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const actor: Actor = {
    id: session.user.id,
    role: session.user.role,
  };
  if (!canViewAdminArea(actor.role)) redirect("/");
  const canManage = canAdminister(actor.role);

  const { entries, missing, members, lastSyncedAt } =
    await getGoogleGroupReconciliation(prisma, actor);

  const groupEmail = process.env.GOOGLE_GROUP_EMAIL;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Google Group</h1>
          <p className="text-muted-foreground">
            A levelezőlista címei és a tagnyilvántartás összevetése.
          </p>
          <p className="text-muted-foreground text-sm">
            {lastSyncedAt
              ? `Utoljára beolvasva: ${lastSyncedAt.toLocaleString("hu-HU")}`
              : "A lista még nem volt beolvasva."}
          </p>
        </div>
        <div className="flex gap-2">
          {groupEmail ? (
            <Button asChild variant="outline">
              <a
                href={googleGroupUrl(groupEmail)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Megnyitás
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          ) : null}
          {canManage ? <RefreshButton /> : null}
        </div>
      </div>

      <EntriesTable
        canManage={canManage}
        entries={entries.map((entry) => ({
          email: entry.email,
          matchStatus: entry.matchStatus,
          note: entry.note,
          member: entry.member
            ? {
                id: entry.member.id,
                firstName: entry.member.firstName,
                lastName: entry.member.lastName,
              }
            : null,
        }))}
        members={members.map((member) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          archived: member.archived,
        }))}
      />

      <MissingTable
        missing={missing.map((member) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          status: member.status,
          archived: member.archived,
        }))}
      />
    </div>
  );
}
