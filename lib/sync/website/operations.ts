import { pushMembers } from "@/lib/website/webhook";
import type { OperationHandlers } from "../executor";
import { buildWebsiteMember } from "./payload";

const MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatarUrl: true,
  status: true,
  joinedSemester: true,
  leadershipRole: { select: { id: true } },
} as const;

// Read here rather than carried in the payload, so a retry sends what is true now: an
// upsert retried after an archive would put the member back on the public site.
export const websiteHandlers: OperationHandlers = {
  SYNC_MEMBER: async (_payload, memberId, prisma, jobId) => {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { ...MEMBER_SELECT, archived: true },
    });
    /* v8 ignore next -- defense in depth; SyncJob.memberId is a required FK */
    if (!member) throw new Error(`Member not found: ${memberId}`);

    const operation = member.archived
      ? ({ op: "archive", sub: member.id } as const)
      : ({ op: "upsert", member: buildWebsiteMember(member) } as const);

    return pushMembers({ operations: [operation] }, jobId);
  },
};
