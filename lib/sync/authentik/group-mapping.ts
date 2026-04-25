import type { MembershipStatus } from "@/app/generated/prisma/client";

export function getStatusGroupUuid(status: MembershipStatus): string {
  const map: Record<MembershipStatus, string | undefined> = {
    MEMBER_CANDIDATE_CANDIDATE: process.env.AUTHENTIK_GROUP_CANDIDATE_CANDIDATE,
    MEMBER_CANDIDATE: process.env.AUTHENTIK_GROUP_CANDIDATE,
    MEMBER: process.env.AUTHENTIK_GROUP_MEMBER,
    ACTIVE_ALUMNI: process.env.AUTHENTIK_GROUP_ALUMNI,
    ALUMNI: process.env.AUTHENTIK_GROUP_ALUMNI,
  };

  const uuid = map[status];
  if (!uuid) {
    throw new Error(`Missing Authentik group UUID for status ${status}`);
  }
  return uuid;
}
