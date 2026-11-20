import type { MembershipStatus } from "@/app/generated/prisma/client";

/** Initials for avatars - last name first, then first name. */
export function getInitials(firstName: string, lastName: string) {
  return `${lastName[0]}${firstName[0]}`.toUpperCase();
}

// The label is free text and may name a second role after the title, but
// "Stúdióvezető-helyettes" is the deputy, so a hyphen must not count.
export function isHeadOfStudio(label?: string) {
  return /^Stúdióvezető(?:$|[\s,])/.test(label ?? "");
}

/** Tailwind classes for the status badge, per membership status. */
export const STATUS_BADGE_CLASS: Record<MembershipStatus, string> = {
  MEMBER_CANDIDATE_CANDIDATE:
    "bg-status-candidate-candidate/15 text-status-candidate-candidate border-status-candidate-candidate/40 dark:bg-status-candidate-candidate/20 dark:border-status-candidate-candidate/30",
  MEMBER_CANDIDATE:
    "bg-status-candidate/15 text-status-candidate border-status-candidate/40 dark:bg-status-candidate/20 dark:border-status-candidate/30",
  MEMBER:
    "bg-status-member/15 text-status-member border-status-member/40 dark:bg-status-member/20 dark:border-status-member/30",
  ACTIVE_ALUMNI:
    "bg-status-active-alumni/15 text-status-active-alumni border-status-active-alumni/40 dark:bg-status-active-alumni/20 dark:border-status-active-alumni/30",
  ALUMNI:
    "bg-status-alumni/15 text-status-alumni border-status-alumni/40 dark:bg-status-alumni/20 dark:border-status-alumni/30",
};

/** Canonical sort order for membership statuses. */
export const STATUS_ORDER: Record<MembershipStatus, number> = {
  MEMBER_CANDIDATE_CANDIDATE: 0,
  MEMBER_CANDIDATE: 1,
  MEMBER: 2,
  ACTIVE_ALUMNI: 3,
  ALUMNI: 4,
};
