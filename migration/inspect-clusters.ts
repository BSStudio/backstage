import "dotenv/config";
import { done, fail, info, step } from "../scripts/utils";
import { readJsonIfExists, writeText } from "./lib/paths";
import { loadSources, type Sources } from "./lib/sources";
import { formatTsv, type TsvRow } from "./lib/tsv";
import type { DrupalUser } from "./load-drupal";
import type { Cluster } from "./match";
import type { SheetMember } from "./normalize-sheets";

/**
 * The clusters `match.ts` could not settle, with the evidence that settles them.
 *
 * The useful part is the near-miss column: a Sheet row with no website account
 * and a Drupal account on nobody's roster are usually the same person behind a
 * changed surname or a typo, and only seeing them side by side makes that
 * obvious.
 */

const NEAR_MISS_DISTANCE = 4;
const NEAR_MISS_SHOWN = 3;

function distance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

interface Candidate {
  key: string;
  label: string;
  distance: number;
}

function nearest(
  sources: Sources,
  cluster: Cluster,
  pool: Cluster[],
): Candidate[] {
  const own = cluster.records
    .map((key) => sources.byKey.get(key)?.nameKey)
    .filter((value): value is string => Boolean(value));

  return pool
    .flatMap((other) =>
      other.records.map((key) => {
        const record = sources.byKey.get(key);
        if (!record?.nameKey) return null;
        const best = Math.min(
          ...own.map((name) => distance(name, record.nameKey)),
        );
        return { key, label: record.label, distance: best };
      }),
    )
    .filter(
      (c): c is Candidate => c !== null && c.distance <= NEAR_MISS_DISTANCE,
    )
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEAR_MISS_SHOWN);
}

function describeSheet(member: SheetMember): string {
  const parts = [
    member.status ?? "no status",
    member.joined.semester
      ? `joined ${member.joined.semester}`
      : `joined "${member.joined.raw}"`,
    member.email ?? "no email",
  ];
  if (member.roleLabel) parts.push(`role "${member.roleLabel}"`);
  if (member.inactive) parts.push("inactive");
  return parts.join("  ");
}

function describeDrupal(user: DrupalUser): string {
  const parts = [
    user.status ?? `state "${user.stateRaw ?? ""}"`,
    user.joined.semester
      ? `joined ${user.joined.semester}`
      : `joined "${user.joined.raw}"`,
    user.mail ?? "no email",
    `lastAccess ${user.lastAccessAt?.slice(0, 10) ?? "never"}`,
  ];
  if (user.passive) parts.push("passive");
  if (user.roleLabel) parts.push(`role "${user.roleLabel}"`);
  return parts.join("  ");
}

async function main(): Promise<void> {
  const clusters = await readJsonIfExists<Cluster[]>("clusters.json");
  if (!clusters) fail("No data/clusters.json. Run migration/match.ts first.");
  const sources = await loadSources();

  const drupalByKey = new Map(
    sources.drupal.map((user) => [`drupal:${user.uid}`, user]),
  );
  const sheetByKey = new Map(
    sources.sheet.map((member) => [member.key, member]),
  );

  const weak = clusters.filter((c) =>
    c.problems.includes("joined only by a weak key"),
  );
  const sheetOnly = clusters.filter((c) => !c.authentik && !c.drupal);
  const drupalOnly = clusters.filter((c) => c.drupal && c.sheet.length === 0);

  const rows: TsvRow[] = [];
  const record = (
    kind: string,
    cluster: Cluster,
    summary: string,
    candidates: Candidate[],
  ): void => {
    rows.push({
      kind,
      cluster: cluster.key,
      records: cluster.records.join(" | "),
      summary,
      nearest: candidates
        .map((c) => `${c.label} (±${c.distance}, ${c.key})`)
        .join(" | "),
      decision: "",
    });
  };

  step(`Joined only by a weak key — ${weak.length}`);
  info("Same person, or two people who share a name? Split in overrides.json.");
  for (const cluster of weak) {
    const drupal = cluster.drupal ? drupalByKey.get(cluster.drupal) : undefined;
    const sheet = cluster.sheet
      .map((key) => sheetByKey.get(key))
      .filter((m): m is SheetMember => Boolean(m));

    info(`${cluster.key}  [${cluster.strengths.join("+")}]`);
    if (drupal)
      info(`      drupal  ${drupal.fullname}  ${describeDrupal(drupal)}`);
    for (const member of sheet) {
      info(
        `      sheet   ${member.fullname}  ${member.tab}  ${describeSheet(member)}`,
      );
    }
    record("weak", cluster, drupal?.fullname ?? "", []);
  }

  step(`Sheet only — no website account — ${sheetOnly.length}`);
  info(
    "Near misses are Drupal accounts on nobody's roster with a similar name.",
  );
  for (const cluster of sheetOnly) {
    const sheet = cluster.sheet
      .map((key) => sheetByKey.get(key))
      .filter((m): m is SheetMember => Boolean(m));
    const candidates = nearest(sources, cluster, drupalOnly);

    info(
      `${sheet[0]?.fullname ?? cluster.key}  (${sheet.map((m) => m.tab).join(", ")})`,
    );
    for (const member of sheet) info(`      ${describeSheet(member)}`);
    for (const candidate of candidates) {
      info(`      near  ±${candidate.distance}  ${candidate.label}`);
    }
    record(
      "sheet-only",
      cluster,
      sheet.map(describeSheet).join(" ; "),
      candidates,
    );
  }

  step(`Drupal only — never on a roster — ${drupalOnly.length}`);
  for (const cluster of drupalOnly) {
    const drupal = drupalByKey.get(cluster.drupal as string);
    if (!drupal) continue;
    const candidates = nearest(sources, cluster, sheetOnly);

    info(`${drupal.fullname ?? drupal.username}  uid ${drupal.uid}`);
    info(`      ${describeDrupal(drupal)}`);
    for (const candidate of candidates) {
      info(`      near  ±${candidate.distance}  ${candidate.label}`);
    }
    record("drupal-only", cluster, describeDrupal(drupal), candidates);
  }

  info(
    await writeText(
      "cluster-review.tsv",
      formatTsv(rows, [
        "kind",
        "cluster",
        "records",
        "summary",
        "nearest",
        "decision",
      ]),
    ),
  );
  done(`${rows.length} clusters listed.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
