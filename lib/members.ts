import type {
  AuditAction,
  MembershipStatus,
} from "@/app/generated/prisma/client";

/** Initials for avatars - last name first, then first name. */
export function getInitials(firstName: string, lastName: string) {
  return `${lastName[0]}${firstName[0]}`.toUpperCase();
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

/** Hungarian labels for audit actions. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  MEMBER_CREATED: "Létrehozás",
  MEMBER_UPDATED: "Módosítás",
  MEMBER_ARCHIVED: "Archiválás",
  MEMBER_REACTIVATED: "Újraaktiválás",
  STATUS_CHANGED: "Státusz módosítás",
  ROLE_ASSIGNED: "Pozíció hozzárendelés",
  ROLE_REMOVED: "Pozíció elvétel",
};

/** Tailwind classes for audit action badges. */
export const AUDIT_ACTION_VARIANT: Record<AuditAction, string> = {
  MEMBER_CREATED: "bg-green-500/15 text-green-600 dark:text-green-400",
  MEMBER_UPDATED: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  MEMBER_ARCHIVED: "bg-red-500/15 text-red-600 dark:text-red-400",
  MEMBER_REACTIVATED:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  STATUS_CHANGED: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  ROLE_ASSIGNED: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  ROLE_REMOVED: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

/** Parse an audit log diff into structured entries. Returns null for non-diff objects. */
export function parseAuditDiff(
  diff: unknown,
): { field: string; old: unknown; new: unknown }[] | "created" | null {
  if (!diff || typeof diff !== "object") return null;
  if ("created" in (diff as Record<string, unknown>)) return "created";
  return Object.entries(diff as Record<string, unknown>).map(([field, val]) => {
    const { old: oldVal, new: newVal } = val as { old: unknown; new: unknown };
    return { field, old: oldVal, new: newVal };
  });
}
