import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { pageActor } from "@/lib/session";
import { ArchivedTable } from "./archived-table";

export const metadata: Metadata = { title: "Archivált tagok - Backstage" };

export default async function ArchivedPage() {
  await pageActor();

  const members = await prisma.member.findMany({
    where: {
      archived: true,
    },
    include: {
      leadershipRole: true,
    },
    orderBy: [{ archivedAt: "desc" }, { lastName: "asc" }],
  });

  // Collect distinct archive years for the filter
  const years = Array.from(
    new Set(
      members
        .map((m) => m.archivedAt?.getFullYear())
        .filter((y): y is number => y !== undefined),
    ),
  ).sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Archivált tagok</h1>
        <p className="text-muted-foreground">{members.length} archivált tag.</p>
      </div>

      <ArchivedTable members={members} years={years} />
    </div>
  );
}
