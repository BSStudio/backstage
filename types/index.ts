import type { MembershipStatus } from "@/app/generated/prisma/client";

// ─── Zod-compatible enum values ──────────────────────────────────────────────

export const MEMBERSHIP_STATUSES = [
  "MEMBER_CANDIDATE_CANDIDATE",
  "MEMBER_CANDIDATE",
  "MEMBER",
  "ACTIVE_ALUMNI",
  "ALUMNI",
] as const satisfies readonly MembershipStatus[];

// The two alumni statuses differ only in the DB and the UI: one Authentik group, one
// mailing list, no permission difference.
export const ALUMNI_STATUSES = [
  "ACTIVE_ALUMNI",
  "ALUMNI",
] as const satisfies readonly MembershipStatus[];

export function isAlumniStatus(status: MembershipStatus): boolean {
  return (ALUMNI_STATUSES as readonly MembershipStatus[]).includes(status);
}

// ─── Display labels ───────────────────────────────────────────────────────────

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  MEMBER_CANDIDATE_CANDIDATE: "Stúdiós jelölt-jelölt",
  MEMBER_CANDIDATE: "Stúdiós jelölt",
  MEMBER: "Stúdiós",
  ACTIVE_ALUMNI: "Aktív öregtag",
  ALUMNI: "Öregtag",
};

// ─── Semester helpers ─────────────────────────────────────────────────────────

// Format: "2025/2026/1" (autumn) or "2025/2026/2" (spring)

export interface Semester {
  startYear: number;
  endYear: number;
  number: 1 | 2; // 1 = autumn, 2 = spring
}

/** Parse "2025/2026/1" → { startYear: 2025, endYear: 2026, number: 1 } */
export function parseSemester(semester: string): Semester {
  const [startYear, endYear, number] = semester.split("/").map(Number);
  return { startYear, endYear, number: number as 1 | 2 };
}

/** Format for display: "2025/2026/1" → "2025 ősz", "2025/2026/2" → "2026 tavasz" */
export function formatSemester(semester: string): string {
  const { startYear, endYear, number } = parseSemester(semester);
  return number === 1 ? `${startYear} ősz` : `${endYear} tavasz`;
}

/** Current semester based on month: Sept–Jan = autumn, Feb–Aug = spring */
export function currentSemester(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9 || month === 1) {
    const startYear = month === 1 ? year - 1 : year;
    return `${startYear}/${startYear + 1}/1`;
  }
  return `${year - 1}/${year}/2`;
}

// ─── Username derivation ─────────────────────────────────────────────────────

// Hungarian digraphs/trigraphs that count as a single "letter"
const HUNGARIAN_MULTIGRAPHS = [
  "dzs",
  "cs",
  "dz",
  "gy",
  "ly",
  "ny",
  "sz",
  "ty",
  "zs",
];

/**
 * Extract the first Hungarian letter from a string.
 * Handles digraphs (cs, gy, sz, ...) and trigraphs (dzs).
 */
function firstHungarianLetter(s: string): string {
  const lower = s.toLowerCase();
  for (const mg of HUNGARIAN_MULTIGRAPHS) {
    if (lower.startsWith(mg)) return mg;
  }
  return lower[0];
}

/**
 * Derive the default Authentik username from first and last name.
 * First Hungarian letter of first name + full last name, lowercase, no accents.
 * Hyphens in last names are removed.
 * e.g. ("János", "Kovács") → "jkovacs"
 *      ("Csaba", "Nagy")   → "csnagy"
 *      ("Dzsennifer", "Kiss-Kovács") → "dzskisskovacs"
 */
export function deriveUsername(firstName: string, lastName: string): string {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const first = normalize(firstName);
  const last = normalize(lastName).replace(/[-\s]/g, "");

  return firstHungarianLetter(first) + last;
}

// ─── Member identity ─────────────────────────────────────────────────────────

// Marks a member with no Authentik account, whose id is therefore not a user UUID.
// A prefix rather than another random UUID: nothing else distinguishes the two shapes.
export const LOCAL_MEMBER_ID_PREFIX = "x_";

export function localMemberId(): string {
  return `${LOCAL_MEMBER_ID_PREFIX}${crypto.randomUUID()}`;
}

export function hasAuthentikAccount(memberId: string): boolean {
  return !memberId.startsWith(LOCAL_MEMBER_ID_PREFIX);
}

// ─── Role & permission helpers ────────────────────────────────────────────────

export type UserRole = "ADMIN" | "LEADER" | "MEMBER";

export function resolveUserRole(groups: string[]): UserRole {
  const adminGroup = process.env.AUTHENTIK_GROUP_ADMIN;
  const leaderGroup = process.env.AUTHENTIK_GROUP_LEADERSHIP;
  if (!adminGroup || !leaderGroup) {
    throw new Error(
      "Missing AUTHENTIK_GROUP_ADMIN or AUTHENTIK_GROUP_LEADERSHIP environment variables",
    );
  }
  if (groups.includes(adminGroup)) return "ADMIN";
  if (groups.includes(leaderGroup)) return "LEADER";
  return "MEMBER";
}
