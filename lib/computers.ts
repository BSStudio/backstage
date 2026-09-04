import type { ComputerMetadata } from "@/lib/services/computer-schemas";

// The agent pings every minute; three missed in a row, so one slow request does not empty
// the page.
export const COMPUTER_ONLINE_WINDOW_MS = 3 * 60_000;

export const COMPUTER_STATUSES = ["ONLINE", "OFFLINE"] as const;

export type ComputerStatus = (typeof COMPUTER_STATUSES)[number];

export function formatComputerName(id: string): string {
  return id.toUpperCase();
}

export function computerStatus(
  lastSeenAt: Date,
  now: Date = new Date(),
): ComputerStatus {
  const since = now.getTime() - lastSeenAt.getTime();
  return since < COMPUTER_ONLINE_WINDOW_MS ? "ONLINE" : "OFFLINE";
}

export const COMPUTER_STATUS_LABELS: Record<ComputerStatus, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
};

export const COMPUTER_STATUS_CLASS: Record<ComputerStatus, string> = {
  ONLINE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  OFFLINE: "bg-muted text-muted-foreground",
};

// Sub-minute precision would say nothing: a machine inside the window is simply online.
export function formatLastSeen(
  lastSeenAt: Date,
  now: Date = new Date(),
): string {
  // A workstation whose clock runs ahead would otherwise be "last seen" in the future.
  const elapsed = Math.max(0, now.getTime() - lastSeenAt.getTime());

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Néhány másodperce";
  if (minutes < 60) return `${minutes} perce`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} órája`;

  return `${Math.floor(hours / 24)} napja`;
}

export interface ComputerGauge {
  label: string;
  percent: number;
}

// Rendered as a filled meter, which reads as "used" on sight
const GAUGES = [
  ["cpuPercent", "CPU-terhelés"],
  ["memoryPercent", "Foglalt memória"],
  ["diskPercent", "Foglalt tárhely"],
] as const;

export function computerGauges(metadata: ComputerMetadata): ComputerGauge[] {
  return GAUGES.flatMap(([key, label]) => {
    const percent = metadata[key];
    return percent === undefined
      ? []
      : [{ label, percent: Math.round(percent) }];
  });
}

// A locked session counts as free: signed in, but nobody is at the machine.
export function formatOccupancy(metadata: ComputerMetadata): string | null {
  const { loggedInUser, locked } = metadata;
  if (loggedInUser === undefined) return null;
  if (loggedInUser === null || locked) return "Szabad";

  // Windows reports DOMAIN\user, and the domain is the same on every studio machine.
  return loggedInUser.replace(/^.*\\/, "");
}
