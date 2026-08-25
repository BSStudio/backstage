import "dotenv/config";
import type { MembershipStatus } from "../app/generated/prisma/client";
import { done, fail, info, step } from "../scripts/utils";
import { readText, writeJson } from "./lib/paths";
import { SKIP_DRUPAL_UIDS } from "./lib/skip";
import { statusFromWebsiteLabel } from "./lib/status";
import {
  normalizeEmail,
  type SemesterGuess,
  semesterFromJoinYear,
} from "./lib/text";
import { parseTsv, type TsvRow } from "./lib/tsv";

/** Profile field names as `lib/website/users.ts` posts them. */
const FIELD = {
  fullname: "profile_fullname",
  nickname: "profile_personal_nickname",
  email: "profile_email",
  mobile: "profile_mobilephone_number",
  inSch: "profile_is_in_sch_this_semester",
  state: "profile_BSS_state",
  passive: "profile_passive",
  hasRole: "profile_BSS_is_in_BSS_HQ",
  roleLabel: "profile_BSS_HQ_role",
  isLeader: "profile_BSS_is_leader",
  joinYear: "profile_BSS_join_year",
} as const;

export interface DrupalUser {
  uid: string;
  username: string;
  mail: string | null;
  init: string | null;
  blocked: boolean;
  createdAt: string | null;
  lastAccessAt: string | null;
  roles: string[];
  profile: Record<string, string>;

  fullname: string | null;
  nickname: string | null;
  profileEmail: string | null;
  mobile: string | null;
  inSch: boolean;
  passive: boolean;
  stateRaw: string | null;
  status: MembershipStatus | null;
  joined: SemesterGuess;
  isLeader: boolean;
  hasRole: boolean;
  roleLabel: string | null;
  archived: boolean;
  /** Set for accounts that must not become members; the reason is the value. */
  skip: string | null;
}

function checkbox(value: string | undefined): boolean {
  return value === "1";
}

function text(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function epochToIso(value: string | null): string | null {
  const seconds = Number(value);
  if (!value || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function tally(values: (string | null)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value ?? "(empty)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

async function read(name: string): Promise<TsvRow[]> {
  try {
    return parseTsv(await readText(`drupal/${name}.tsv`));
  } catch {
    return fail(
      `migration/data/drupal/${name}.tsv is missing.\n` +
        "  See the Drupal extraction step in migration/README.md.",
    );
  }
}

function requireKnownFields(fields: TsvRow[]): void {
  const present = new Set(fields.map((row) => row.name));
  const missing = Object.values(FIELD).filter((name) => !present.has(name));
  if (missing.length === 0) {
    info("all expected profile fields exist");
    return;
  }
  fail(
    `profile fields not found in this database: ${missing.join(", ")}\n` +
      "  Every member would silently get null for them. Reconcile FIELD in\n" +
      "  migration/load-drupal.ts against 01-profile-fields.tsv before continuing.",
  );
}

function build(
  userRow: TsvRow,
  profile: Record<string, string>,
  roles: string[],
): DrupalUser {
  const stateRaw = text(profile[FIELD.state]);
  const passive = checkbox(profile[FIELD.passive]);
  const blocked = userRow.status === "0";

  return {
    uid: userRow.uid ?? "",
    username: userRow.name ?? "",
    mail: normalizeEmail(userRow.mail),
    init: normalizeEmail(userRow.init),
    blocked,
    createdAt: epochToIso(userRow.created),
    lastAccessAt: epochToIso(userRow.access),
    roles,
    profile,

    fullname: text(profile[FIELD.fullname]),
    nickname: text(profile[FIELD.nickname]),
    profileEmail: normalizeEmail(profile[FIELD.email]),
    mobile: text(profile[FIELD.mobile]),
    inSch: checkbox(profile[FIELD.inSch]),
    passive,
    stateRaw,
    status: statusFromWebsiteLabel(stateRaw),
    joined: semesterFromJoinYear(profile[FIELD.joinYear]),
    isLeader: checkbox(profile[FIELD.isLeader]),
    hasRole: checkbox(profile[FIELD.hasRole]),
    roleLabel: text(profile[FIELD.roleLabel]),
    archived: passive || blocked,
    skip: SKIP_DRUPAL_UIDS.get(userRow.uid ?? "") ?? null,
  };
}

async function main(): Promise<void> {
  step("Reading exports");
  const [fields, userRows, valueRows, roleRows] = await Promise.all([
    read("01-profile-fields"),
    read("02-users"),
    read("03-profile-values"),
    read("04-user-roles"),
  ]);
  info(`${userRows.length} users, ${valueRows.length} profile values`);
  requireKnownFields(fields);

  const profiles = new Map<string, Record<string, string>>();
  for (const row of valueRows) {
    if (!row.uid || !row.field) continue;
    const bag = profiles.get(row.uid) ?? {};
    bag[row.field] = row.value ?? "";
    profiles.set(row.uid, bag);
  }

  const roles = new Map<string, string[]>();
  for (const row of roleRows) {
    if (!row.uid || !row.role) continue;
    roles.set(row.uid, [...(roles.get(row.uid) ?? []), row.role]);
  }

  const users = userRows.map((row) =>
    build(
      row,
      profiles.get(row.uid ?? "") ?? {},
      roles.get(row.uid ?? "") ?? [],
    ),
  );

  step("Status labels");
  for (const [label, count] of tally(users.map((u) => u.stateRaw))) {
    const mapped = statusFromWebsiteLabel(label);
    const marker = mapped ? `→ ${mapped}` : "→ UNMAPPED";
    info(`${String(count).padStart(4)}  ${label.padEnd(28)} ${marker}`);
  }
  const unmapped = users.filter((u) => u.stateRaw && !u.status);
  if (unmapped.length > 0) {
    info(
      `${unmapped.length} users carry a label with no MembershipStatus. Add them to\n` +
        "  LEGACY_ALIASES in migration/lib/status.ts, or let the review sheet resolve them.",
    );
  }

  step("Join year");
  const guessed = users.filter((u) => u.joined.confidence === "guessed").length;
  const unknownJoin = users.filter(
    (u) => u.joined.confidence === "unknown",
  ).length;
  info(
    `${users.length - guessed - unknownJoin} exact, ${guessed} guessed, ${unknownJoin} unparseable`,
  );

  step("Emails");
  const noEmail = users.filter((u) => !u.mail && !u.profileEmail && !u.init);
  info(`${noEmail.length} users with no usable email address`);

  const seen = new Map<string, string[]>();
  for (const user of users) {
    const key = user.mail ?? user.profileEmail;
    if (!key) continue;
    seen.set(key, [...(seen.get(key) ?? []), user.uid]);
  }
  const duplicates = [...seen].filter(([, uids]) => uids.length > 1);
  info(`${duplicates.length} email addresses used by more than one account`);
  for (const [email, uids] of duplicates.slice(0, 20)) {
    info(`  ${email} → uid ${uids.join(", ")}`);
  }
  if (duplicates.length > 20) info(`  … and ${duplicates.length - 20} more`);

  step("Skipped accounts");
  for (const user of users.filter((u) => u.skip)) {
    info(`uid ${user.uid}  ${user.fullname ?? user.username} — ${user.skip}`);
  }

  step("Archival");
  info(`${users.filter((u) => u.blocked).length} blocked (users.status = 0)`);
  info(
    `${users.filter((u) => u.passive).length} passive (profile_passive = 1)`,
  );
  info(`${users.filter((u) => u.archived).length} archived by either signal`);

  info(await writeJson("drupal-users.json", users));
  done("Drupal export normalized.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
