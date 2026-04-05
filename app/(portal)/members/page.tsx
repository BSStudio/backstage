import prisma from "@/lib/prisma";
import { MembersTable } from "./members-table";

export default async function MembersPage() {
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Aktív tagok</h1>
        <p className="text-muted-foreground">{members.length} aktív tag.</p>
      </div>

      <MembersTable members={members} />
    </div>
  );
}
