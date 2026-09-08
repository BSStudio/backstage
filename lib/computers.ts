import type { ComputerMetadata } from "@/lib/services/computer-schemas";

export const COMPUTER_ONLINE_WINDOW_MS = 3 * 60_000;

export const COMPUTER_REFRESH_MS = 30_000;

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

export const COMPUTER_TONES = ["FREE", "BUSY", "IDLE", "OFFLINE"] as const;

export type ComputerTone = (typeof COMPUTER_TONES)[number];

export interface ComputerVerdict {
  tone: ComputerTone;
  label: string;
  /** Who is at the machine, when anyone is. */
  user: string | null;
}

/**
 * The one question the pages answer, resolved once so the dashboard and /computers cannot
 * disagree. The tone is separate from the label because colour is what carries the answer
 * across a room; the label is what carries it for everyone else.
 */
export function computerVerdict(computer: {
  status: ComputerStatus;
  metadata: ComputerMetadata;
}): ComputerVerdict {
  if (computer.status === "OFFLINE")
    return { tone: "OFFLINE", label: "Offline", user: null };

  const { loggedInUser, locked } = computer.metadata;
  // An agent too old to report the field at all. Online is the whole of what it told us.
  if (loggedInUser === undefined)
    return { tone: "IDLE", label: "Online", user: null };

  // A locked session counts as free: signed in, but nobody is at the machine
  if (!loggedInUser || locked)
    return { tone: "FREE", label: "Szabad", user: null };

  return {
    tone: "BUSY",
    label: "Foglalt",
    // Windows reports DOMAIN\user, and the domain is the same on every studio machine.
    user: loggedInUser.replace(/^.*\\/, ""),
  };
}

export interface ComputerToneStyle {
  /** Card ground and ring. Tinting the whole surface is what makes a free machine findable. */
  surface: string;
  text: string;
}

export const COMPUTER_TONE_STYLE: Record<ComputerTone, ComputerToneStyle> = {
  FREE: {
    surface:
      "bg-emerald-500/8 ring-emerald-600/25 dark:bg-emerald-400/12 dark:ring-emerald-400/25",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  BUSY: {
    surface:
      "bg-amber-500/10 ring-amber-600/25 dark:bg-amber-400/12 dark:ring-amber-400/25",
    text: "text-amber-700 dark:text-amber-400",
  },
  IDLE: {
    surface: "bg-card ring-foreground/10",
    text: "text-foreground",
  },
  OFFLINE: {
    surface: "bg-muted/50 ring-foreground/10",
    text: "text-muted-foreground",
  },
};

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

/** How many machines somebody could sit down at right now. */
export function countFreeComputers(
  computers: { status: ComputerStatus; metadata: ComputerMetadata }[],
): number {
  return computers.filter((c) => computerVerdict(c).tone === "FREE").length;
}
