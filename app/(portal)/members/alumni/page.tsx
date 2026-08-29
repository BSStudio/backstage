import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { pageActor } from "@/lib/session";
import { AlumniTable } from "./alumni-table";

export const metadata: Metadata = { title: "Öregtagok - Backstage" };

export default async function AlumniPage() {
  await pageActor();

  const members = await prisma.member.findMany({
    where: {
      archived: false,
      status: "ALUMNI",
    },
    include: {
      leadershipRole: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Öregtagok</h1>
        <p className="text-muted-foreground">{members.length} öregtag.</p>
      </div>

      <AlumniTable members={members} />
    </div>
  );
}
