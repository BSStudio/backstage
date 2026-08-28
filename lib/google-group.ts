import type { GoogleGroupMatchStatus } from "@/app/generated/prisma/client";

export const GOOGLE_GROUP_MATCH_LABELS: Record<GoogleGroupMatchStatus, string> =
  {
    MATCHED: "Aktív tag",
    ARCHIVED_ON_LIST: "Archivált tag",
    SECONDARY_EMAIL: "Másodlagos cím",
    UNKNOWN: "Ismeretlen",
  };

export const GOOGLE_GROUP_MATCH_VARIANT: Record<
  GoogleGroupMatchStatus,
  string
> = {
  MATCHED: "bg-green-500/15 text-green-600 dark:text-green-400",
  ARCHIVED_ON_LIST: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  SECONDARY_EMAIL: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  UNKNOWN: "bg-red-500/15 text-red-600 dark:text-red-400",
};

// Workspace-hosted groups live under /a/<domain>/g/<name>, and the address is all we store.
export function googleGroupUrl(groupEmail: string): string {
  const [name, domain] = groupEmail.split("@");
  return `https://groups.google.com/a/${domain}/g/${name}`;
}
