import "dotenv/config";
import { done, info, step } from "../scripts/utils";
import { isAccepted, readAcknowledgements } from "./lib/decisions";
import { readJsonIfExists, writeJson, writeText } from "./lib/paths";
import {
  loadSources,
  type SourceKind,
  type SourceRecord,
  type Sources,
} from "./lib/sources";
import { formatTsv, type TsvRow } from "./lib/tsv";
import { UnionFind } from "./lib/union-find";

/**
 * Groups the three exports into one cluster per person.
 *
 * Strong edges (a shared email address, a shared username) are taken at face
 * value. Weak edges — a shared name, or one name contained in another — are where
 * two different Kovács Jánoses become one member, so they are refused whenever
 * they would put two records of the same kind in one cluster, and any cluster
 * that needed one is flagged for review.
 */

type Strength = "email" | "username" | "name" | "name-subset" | "override";

const WEAK: Strength[] = ["name", "name-subset"];

const REVIEW_FILE = "match-review.tsv";

const WEAK_PROBLEM = "joined only by a weak key";

interface Edge {
  a: string;
  b: string;
  strength: Strength;
  via: string;
}

interface Overrides {
  /** Record keys forced into the same cluster. */
  merge?: string[][];
  /** Record keys that must never share a cluster. */
  split?: string[][];
}

export interface Cluster {
  key: string;
  records: string[];
  authentik: string | null;
  drupal: string | null;
  sheet: string[];
  strengths: Strength[];
  problems: string[];
}

function pairsOf(keys: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 1; i < keys.length; i++) pairs.push([keys[0], keys[i]]);
  return pairs;
}

function edgesFrom(
  records: SourceRecord[],
  pick: (record: SourceRecord) => string[],
  strength: Strength,
): Edge[] {
  const buckets = new Map<string, string[]>();
  for (const record of records) {
    for (const value of pick(record)) {
      buckets.set(value, [...(buckets.get(value) ?? []), record.key]);
    }
  }

  const edges: Edge[] = [];
  for (const [value, keys] of buckets) {
    if (keys.length < 2) continue;
    for (const [a, b] of pairsOf(keys)) {
      edges.push({ a, b, strength, via: value });
    }
  }
  return edges;
}

/**
 * Records whose names differ only by how much of the name was written down.
 *
 * "Ormos Rita" and "Ormos Rita Zsófia" are one person recorded twice; "Kelemen
 * Anna" and "Kelemen Ábel" are two people who happen to share an initial and a
 * surname. Both pairs derive the same username, so that alone merged them —
 * which cost Kelemen Ábel and Zilahi Márton their existence. Requiring one name to
 * be contained in the other keeps the first kind and refuses the second.
 *
 * Candidates come from the derived username because it buckets cheaply; the
 * subset test is what actually decides.
 */
function nameSubsetEdges(records: SourceRecord[]): Edge[] {
  const buckets = new Map<string, SourceRecord[]>();
  for (const record of records) {
    for (const username of record.usernames) {
      buckets.set(username, [...(buckets.get(username) ?? []), record]);
    }
  }

  const tokens = (record: SourceRecord): Set<string> =>
    new Set(record.nameKey.split(" ").filter(Boolean));
  const contains = (big: Set<string>, small: Set<string>): boolean =>
    [...small].every((token) => big.has(token));

  const edges: Edge[] = [];
  for (const [via, group] of buckets) {
    if (group.length < 2) continue;
    // Every pair, not a star from the first record: the odd one out in a bucket
    // must not stop the others from finding each other.
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = tokens(group[i]);
        const b = tokens(group[j]);
        // Two tokens minimum, so a lone surname does not swallow everyone who
        // shares it.
        if (Math.min(a.size, b.size) < 2) continue;
        if (!contains(a, b) && !contains(b, a)) continue;
        edges.push({
          a: group[i].key,
          b: group[j].key,
          strength: "name-subset",
          via,
        });
      }
    }
  }
  return edges;
}

function kindOf(key: string): SourceKind {
  return key.split(":")[0] as SourceKind;
}

function tabOf(key: string): string | null {
  return kindOf(key) === "sheet" ? key.split(":")[1] : null;
}

/**
 * Reasons a weak key is not enough on its own.
 *
 * Two Authentik users or two Drupal users in one cluster means the key matched
 * two different people. Two rows on the *same* sheet tab means the same: a tab
 * is one roster, so nobody is on it twice — a real duplicate row still merges,
 * but only on a strong key.
 */
function wouldCollide(
  members: Map<string, string[]>,
  find: (key: string) => string,
  a: string,
  b: string,
): boolean {
  const left = members.get(find(a)) ?? [];
  const right = members.get(find(b)) ?? [];

  for (const kind of ["authentik", "drupal"] as const) {
    const inLeft = left.some((key) => kindOf(key) === kind);
    const inRight = right.some((key) => kindOf(key) === kind);
    if (inLeft && inRight) return true;
  }

  const leftTabs = new Set(left.map(tabOf).filter(Boolean));
  return right.map(tabOf).some((tab) => tab !== null && leftTabs.has(tab));
}

function clusterKey(records: string[]): string {
  const authentik = records.find((key) => kindOf(key) === "authentik");
  if (authentik) return authentik;
  const drupal = records.find((key) => kindOf(key) === "drupal");
  if (drupal) return drupal;
  return [...records].sort()[0];
}

function labelFor(sources: Sources, key: string): string {
  return sources.byKey.get(key)?.label ?? key;
}

async function main(): Promise<void> {
  const sources = await loadSources();
  const overrides = (await readJsonIfExists<Overrides>("overrides.json")) ?? {};
  const acknowledged = readAcknowledgements(REVIEW_FILE);
  const blocked = new Set(
    (overrides.split ?? []).flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
  );

  step("Sources");
  info(
    `${sources.authentik.length} authentik, ${sources.drupal.length} drupal, ` +
      `${sources.sheet.length} sheet rows`,
  );

  const strong: Edge[] = [
    ...(overrides.merge ?? []).flatMap((group) =>
      pairsOf(group).map(([a, b]) => ({
        a,
        b,
        strength: "override" as Strength,
        via: "overrides.json",
      })),
    ),
    ...edgesFrom(sources.records, (r) => r.emails, "email"),
    ...edgesFrom(
      sources.records.filter((r) => r.kind !== "sheet"),
      (r) => r.usernames.slice(0, 1),
      "username",
    ),
  ];
  const weak: Edge[] = [
    ...edgesFrom(sources.records, (r) => [r.nameKey].filter(Boolean), "name"),
    ...nameSubsetEdges(sources.records),
  ];

  const union = new UnionFind();
  for (const record of sources.records) union.add(record.key);

  const applied = new Map<string, Strength[]>();
  const members = new Map<string, string[]>();
  for (const record of sources.records) members.set(record.key, [record.key]);

  const refused: Edge[] = [];
  const apply = (edge: Edge): void => {
    if (blocked.has(`${edge.a}|${edge.b}`)) return;
    if (!union.connected(edge.a, edge.b)) {
      if (
        WEAK.includes(edge.strength) &&
        wouldCollide(members, (key) => union.find(key), edge.a, edge.b)
      ) {
        refused.push(edge);
        return;
      }
      const merged = [
        ...(members.get(union.find(edge.a)) ?? []),
        ...(members.get(union.find(edge.b)) ?? []),
      ];
      const carried = [
        ...(applied.get(union.find(edge.a)) ?? []),
        ...(applied.get(union.find(edge.b)) ?? []),
      ];
      union.union(edge.a, edge.b);
      members.set(union.find(edge.a), merged);
      applied.set(union.find(edge.a), carried);
    }
    const root = union.find(edge.a);
    applied.set(root, [...(applied.get(root) ?? []), edge.strength]);
  };

  for (const edge of strong) apply(edge);
  for (const edge of weak) apply(edge);

  const clusters: Cluster[] = [...union.groups().values()].map((records) => {
    const strengths = [...new Set(applied.get(union.find(records[0])) ?? [])];
    const authentik = records.filter((k) => kindOf(k) === "authentik");
    const drupal = records.filter((k) => kindOf(k) === "drupal");
    const sheet = records.filter((k) => kindOf(k) === "sheet");

    const problems: string[] = [];
    if (authentik.length > 1)
      problems.push(`${authentik.length} authentik users`);
    if (drupal.length > 1) problems.push(`${drupal.length} drupal users`);
    // A weak-only cluster someone has already looked at and signed off in the
    // review file stops being raised. The check still runs — the acknowledgement
    // is per person, so a cluster that changes shape is asked about again.
    if (
      strengths.length > 0 &&
      strengths.every((s) => WEAK.includes(s)) &&
      !isAccepted(acknowledged, records)
    ) {
      problems.push(WEAK_PROBLEM);
    }
    if (authentik.length === 0 && drupal.length === 0) {
      problems.push("sheet only — no website account to link");
    }

    return {
      key: clusterKey(records),
      records: [...records].sort(),
      authentik: authentik[0] ?? null,
      drupal: drupal[0] ?? null,
      sheet: sheet.sort(),
      strengths,
      problems,
    };
  });

  for (const [a, b] of overrides.split ?? []) {
    if (union.connected(a, b)) {
      const cluster = clusters.find((c) => c.records.includes(a));
      cluster?.problems.push(
        `overrides.json says ${a} and ${b} are different people, but another key joins them`,
      );
    }
  }

  step("Clusters");
  info(`${clusters.length} people from ${sources.records.length} records`);
  const shape = (c: Cluster): string =>
    [
      c.authentik ? "A" : "-",
      c.drupal ? "D" : "-",
      c.sheet.length > 0 ? "S" : "-",
    ].join("");
  const shapes = new Map<string, number>();
  for (const cluster of clusters) {
    shapes.set(shape(cluster), (shapes.get(shape(cluster)) ?? 0) + 1);
  }
  for (const [pattern, count] of [...shapes].sort((a, b) => b[1] - a[1])) {
    info(
      `${String(count).padStart(4)}  ${pattern}   (A=authentik D=drupal S=sheet)`,
    );
  }

  step("Needs review");
  const flagged = clusters.filter((c) => c.problems.length > 0);
  info(`${flagged.length} clusters`);
  const reasons = new Map<string, number>();
  for (const cluster of flagged) {
    for (const problem of cluster.problems) {
      reasons.set(problem, (reasons.get(problem) ?? 0) + 1);
    }
  }
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    info(`${String(count).padStart(4)}  ${reason}`);
  }
  if (refused.length > 0) {
    info(
      `${refused.length} weak edges refused because they would have merged two ` +
        "records of the same kind",
    );
  }

  // Acknowledged clusters carry no problem any more, so they are not in
  // `flagged` — but dropping their row would lose the acknowledgement and raise
  // them again on the next run.
  const inReview = [
    ...flagged,
    ...clusters.filter(
      (cluster) =>
        !flagged.includes(cluster) && isAccepted(acknowledged, cluster.records),
    ),
  ];

  const review: TsvRow[] = inReview.map((cluster) => ({
    cluster: cluster.key,
    problems: cluster.problems.join("; ") || "acknowledged",
    joinedBy: cluster.strengths.join("+"),
    authentik: cluster.authentik ? labelFor(sources, cluster.authentik) : "",
    drupal: cluster.drupal ? labelFor(sources, cluster.drupal) : "",
    sheet: cluster.sheet.map((key) => labelFor(sources, key)).join(" | "),
    decision: isAccepted(acknowledged, cluster.records) ? "ok" : "",
    records: cluster.records.join(" | "),
  }));

  info(
    await writeText(
      REVIEW_FILE,
      formatTsv(review, [
        "cluster",
        "problems",
        "joinedBy",
        "authentik",
        "drupal",
        "sheet",
        "decision",
        "records",
      ]),
    ),
  );
  info(await writeJson("clusters.json", clusters));

  done(`${clusters.length} clusters, ${flagged.length} need a look.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
