import "dotenv/config";
import { buildJoinYearFromSemester, WEBSITE_STATE } from "../lib/website/users";
import { done, fail, info, step } from "../scripts/utils";
import { deriveUsername } from "../types";
import { readJsonIfExists, writeText } from "./lib/paths";
import { loadSources, pickSheetRow } from "./lib/sources";
import { formatTsv, type TsvRow } from "./lib/tsv";
import type { Cluster } from "./match";
import type { SheetMember } from "./normalize-sheets";

/**
 * The two lists of work to do *on the website*, before the next dump.
 *
 * Fixing Drupal rather than patching around them in here is the better trade:
 * the website is the system that outlives this migration, and a status typed
 * into the real form is worth more than an override file nobody will read
 * again.
 */

const CREATE_PAGE = "/admin/user/user/create";

function websiteBase(): string {
  return (process.env.WEBSITE_URL ?? "https://bsstudio.hu").replace(/\/+$/, "");
}

function editUrl(uid: string, tab: string): string {
  return `${websiteBase()}${encodeURI(`/user/${uid}/edit/${tab}`)}`;
}

/**
 * The name the account would get if the app created it. Checked against every
 * username Drupal already holds, and against the ones earlier rows in this list
 * have claimed, so the file can be worked through top to bottom.
 */
function availableUsername(base: string, taken: Set<string>): string {
  if (!base) return "";
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

async function main(): Promise<void> {
  const clusters = await readJsonIfExists<Cluster[]>("clusters.json");
  if (!clusters) fail("No data/clusters.json. Run migration/match.ts first.");
  const sources = await loadSources();

  const sheetByKey = new Map(
    sources.sheet.map((member) => [member.key, member]),
  );
  // ── 1. Statuses the export could not map ──────────────────────────────────

  const unresolved = sources.drupal.filter((user) => !user.status);
  const statusRows: TsvRow[] = unresolved.map((user) => ({
    uid: user.uid,
    name: user.fullname ?? user.username,
    email: user.mail,
    currentState: user.stateRaw ?? "(empty)",
    joined: user.joined.raw || "(empty)",
    passive: user.passive ? "1" : "0",
    lastAccess: user.lastAccessAt?.slice(0, 10) ?? "never",
    newState: "",
    url: editUrl(user.uid, "BSS adatok"),
  }));

  step(`Statuses to set on the website — ${statusRows.length}`);
  info(`valid values: ${Object.values(WEBSITE_STATE).join(" | ")}`);
  for (const row of statusRows) {
    info(
      `uid ${String(row.uid).padStart(4)}  ${String(row.name).padEnd(24)} ` +
        `"${row.currentState}"  joined "${row.joined}"  passive=${row.passive}  ` +
        `last ${row.lastAccess}`,
    );
    info(`      ${row.url}`);
  }

  // ── 2. Members with no website account ────────────────────────────────────

  const taken = new Set(sources.drupal.map((user) => user.username));
  const accountless = clusters
    .filter((cluster) => !cluster.drupal && cluster.sheet.length > 0)
    .map((cluster) => {
      const rows = cluster.sheet
        .map((key) => sheetByKey.get(key))
        .filter((row): row is SheetMember => Boolean(row));
      return { cluster, row: pickSheetRow(rows), tabs: rows.map((r) => r.tab) };
    })
    // Alumni first: they are the ones the website's alumni page shows.
    .sort((a, b) => {
      const rank = (tabs: string[]): number =>
        tabs.includes("alumni") ? 0 : 1;
      return (
        rank(a.tabs) - rank(b.tabs) ||
        a.row.fullname.localeCompare(b.row.fullname)
      );
    });

  const createRows: TsvRow[] = accountless.map(({ cluster, row, tabs }) => {
    const blockers: string[] = [];
    if (!row.email)
      blockers.push("no email — Drupal will not create the account");
    if (!row.joined.semester) blockers.push("no join year");
    if (!row.lastName || !row.firstName) blockers.push("name not split");

    return {
      needed: tabs.includes("alumni")
        ? "yes — on the alumni page"
        : "optional — archived",
      username: availableUsername(
        row.firstName && row.lastName
          ? deriveUsername(row.firstName, row.lastName)
          : "",
        taken,
      ),
      fullname: row.fullname,
      nickname: row.nickname ?? row.firstName,
      email: row.email,
      mobile: row.mobile,
      joinYear: row.joined.semester
        ? buildJoinYearFromSemester(row.joined.semester)
        : "",
      state: row.status ? WEBSITE_STATE[row.status] : "",
      blockers: blockers.join("; "),
      cluster: cluster.key,
      tabs: tabs.join(", "),
      url: `${websiteBase()}${CREATE_PAGE}`,
    };
  });

  const alumni = createRows.filter((row) => row.needed?.startsWith("yes"));
  step(
    `Accounts to create — ${alumni.length} alumni, ` +
      `${createRows.length - alumni.length} archived (optional)`,
  );
  for (const row of alumni) {
    info(
      `${String(row.username).padEnd(16)} ${String(row.fullname).padEnd(24)} ` +
        `${row.email ?? "NO EMAIL"}  ${row.joinYear}  ${row.state}`,
    );
    if (row.blockers) info(`      blocked: ${row.blockers}`);
  }

  const blocked = createRows.filter((row) => row.blockers);
  if (blocked.length > 0) {
    info(
      `${blocked.length} of ${createRows.length} rows are missing something the ` +
        "create form requires — see the blockers column",
    );
  }

  step("Files");
  info(
    await writeText(
      "website-fix-status.tsv",
      formatTsv(statusRows, [
        "uid",
        "name",
        "email",
        "currentState",
        "joined",
        "passive",
        "lastAccess",
        "newState",
        "url",
      ]),
    ),
  );
  info(
    await writeText(
      "website-create-users.tsv",
      formatTsv(createRows, [
        "needed",
        "username",
        "fullname",
        "nickname",
        "email",
        "mobile",
        "joinYear",
        "state",
        "blockers",
        "cluster",
        "tabs",
        "url",
      ]),
    ),
  );

  done(
    "Work through both on the website, then re-run extract-drupal, load-drupal " +
      "and match.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
