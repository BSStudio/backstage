import "dotenv/config";
import { done, fail, info, step } from "../scripts/utils";
import { readJsonIfExists, writeText } from "./lib/paths";
import { formatTsv, type TsvRow } from "./lib/tsv";
import type { DrupalUser } from "./load-drupal";

/**
 * The rows `load-drupal.ts` counted but could not decide, listed with enough
 * context to decide them and a link to the live profile.
 *
 * Output doubles as an input: fill the `decision` column of
 * `data/drupal-review.tsv` and the matcher reads it back.
 */

const COLUMNS = [
  "kind",
  "uid",
  "name",
  "email",
  "current",
  "suggestion",
  "decision",
  "evidence",
  "url",
];

const STATUS_VALUES =
  "MEMBER_CANDIDATE_CANDIDATE | MEMBER_CANDIDATE | MEMBER | ACTIVE_ALUMNI | ALUMNI | SKIP";

function profileUrl(uid: string): string {
  const base = (process.env.WEBSITE_URL ?? "https://bsstudio.hu").replace(
    /\/+$/,
    "",
  );
  return `${base}${encodeURI(`/user/${uid}/edit/BSS adatok`)}`;
}

function evidence(user: DrupalUser): string {
  const parts = [
    `joined="${user.joined.raw}"`,
    `passive=${user.passive ? 1 : 0}`,
    `blocked=${user.blocked ? 1 : 0}`,
    `lastAccess=${user.lastAccessAt?.slice(0, 10) ?? "never"}`,
  ];
  if (user.roleLabel) parts.push(`role="${user.roleLabel}"`);
  if (user.isLeader) parts.push("leader");
  if (user.roles.length > 0) parts.push(`drupalRoles=${user.roles.join("/")}`);
  return parts.join(" ");
}

function row(user: DrupalUser, kind: string, suggestion: string): TsvRow {
  return {
    kind,
    uid: user.uid,
    name: user.fullname ?? user.username,
    email: user.mail ?? user.profileEmail,
    current:
      kind === "status"
        ? (user.stateRaw ?? "(empty)")
        : user.joined.raw || "(empty)",
    suggestion,
    decision: "",
    evidence: evidence(user),
    url: profileUrl(user.uid),
  };
}

function print(rows: TsvRow[]): void {
  for (const entry of rows) {
    info(
      `uid ${String(entry.uid).padStart(4)}  ${String(entry.name).padEnd(26)} ` +
        `${String(entry.current).padEnd(16)} ${entry.email}`,
    );
    info(`      ${entry.evidence}`);
    info(`      ${entry.url}`);
  }
}

async function main(): Promise<void> {
  const users = await readJsonIfExists<DrupalUser[]>("drupal-users.json");
  if (!users) {
    fail("No data/drupal-users.json. Run migration/load-drupal.ts first.");
  }

  const unresolvedStatus = users.filter((u) => !u.status);
  const guessed = users.filter((u) => u.joined.confidence === "guessed");
  const unparseable = users.filter((u) => u.joined.confidence === "unknown");

  step(`Status not resolved — ${unresolvedStatus.length} users`);
  info(`decision column takes one of: ${STATUS_VALUES}`);
  const labels = new Map<string, number>();
  for (const user of unresolvedStatus) {
    const label = user.stateRaw ?? "(empty)";
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  info(
    `distinct labels: ${[...labels]
      .map(([label, count]) => `"${label}" ×${count}`)
      .join(", ")}`,
  );
  info(
    "A label that always means the same thing belongs in LEGACY_ALIASES\n" +
      "  (migration/lib/status.ts) — decide it once instead of per user.",
  );
  const statusRows = unresolvedStatus.map((u) => row(u, "status", ""));
  print(statusRows);

  step(`Join year guessed — ${guessed.length} users`);
  info(
    'A bare year with no season. Autumn assumed; "2005/2006/2" to override.',
  );
  const guessedRows = guessed.map((u) =>
    row(u, "joined", u.joined.semester ?? ""),
  );
  print(guessedRows);

  step(`Join year unparseable — ${unparseable.length} users`);
  info("No four-digit year in the field. Needs a semester or SKIP.");
  const unparseableRows = unparseable.map((u) => row(u, "joined", ""));
  print(unparseableRows);

  const all = [...statusRows, ...guessedRows, ...unparseableRows];
  step("Review file");
  info(await writeText("drupal-review.tsv", formatTsv(all, COLUMNS)));
  info(`${all.length} rows with an empty decision column`);

  done("Fill in `decision` and keep the file — the matcher reads it back.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
