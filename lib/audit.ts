import type { AuditAction } from "@/app/generated/prisma/client";

/** Hungarian labels for audit actions. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  MEMBER_CREATED: "Létrehozás",
  MEMBER_UPDATED: "Módosítás",
  MEMBER_ARCHIVED: "Archiválás",
  MEMBER_REACTIVATED: "Újraaktiválás",
  STATUS_CHANGED: "Státusz módosítás",
  ROLE_ASSIGNED: "Pozíció hozzárendelés",
  ROLE_CHANGED: "Pozíció módosítás",
  ROLE_REMOVED: "Pozíció elvétel",
  AVATAR_UPLOADED: "Profilkép feltöltés",
  AVATAR_REMOVED: "Profilkép törlés",
  GOOGLE_GROUP_SYNCED: "Google Group beolvasás",
  CARDDAV_TOKEN_CREATED: "CardDAV eszköz hozzáadás",
  CARDDAV_TOKEN_REVOKED: "CardDAV eszköz törlés",
  APP_LINK_CREATED: "Alkalmazás létrehozás",
  APP_LINK_UPDATED: "Alkalmazás módosítás",
  APP_LINK_DELETED: "Alkalmazás törlés",
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
  ROLE_CHANGED: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  ROLE_REMOVED: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  AVATAR_UPLOADED: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  AVATAR_REMOVED: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  GOOGLE_GROUP_SYNCED: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  CARDDAV_TOKEN_CREATED: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  CARDDAV_TOKEN_REVOKED:
    "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  APP_LINK_CREATED: "bg-green-500/15 text-green-600 dark:text-green-400",
  APP_LINK_UPDATED: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  APP_LINK_DELETED: "bg-red-500/15 text-red-600 dark:text-red-400",
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
