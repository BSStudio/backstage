import type { MembershipStatus } from "@/app/generated/prisma/client";
import { absoluteAppUrl } from "@/lib/app-url";
import type { WebsiteMember } from "@/lib/website/webhook";

export interface WebsiteMemberSource {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  avatarUrl: string | null;
  status: MembershipStatus;
  joinedSemester: string;
  leadershipRole: unknown | null;
}

export function buildWebsiteMember(member: WebsiteMemberSource): WebsiteMember {
  return {
    sub: member.id,
    fullName: `${member.lastName} ${member.firstName}`.trim(),
    nickname: member.nickname,
    avatarUrl: member.avatarUrl ? absoluteAppUrl(member.avatarUrl) : null,
    membershipStatus: member.status,
    isLeadership: member.leadershipRole !== null,
    joinedSemester: member.joinedSemester,
  };
}
