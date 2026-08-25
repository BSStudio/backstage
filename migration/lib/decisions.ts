import { existsSync, readFileSync } from "node:fs";
import { dataPath } from "./paths";
import { parseTsv } from "./tsv";

/**
 * Human answers written into a review file's own columns.
 *
 * The alternative — a separate overrides file keyed by something — means
 * reading one file to know what to type into another. Here the row that asks
 * the question is the row that carries the answer, and every generator reads
 * its file back before overwriting it so the answers survive a re-run.
 */

export interface Decision {
  setStatus: string | null;
  setJoined: string | null;
  decision: string | null;
}

const SKIP = new Set(["skip", "reject", "ignore", "kihagy"]);

// Overrides a skip the build applies on its own.
const KEEP = new Set(["keep", "import", "megtart"]);

export type Decisions = Map<string, Decision>;

function value(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Indexed by every record key on the row, not by the cluster key: a cluster
 * re-keys the moment it gains a source, and an answer that stops applying
 * because the person acquired a website account is worse than no answer.
 */
export function readDecisions(file: string): Decisions {
  const decisions: Decisions = new Map();
  if (!existsSync(dataPath(file))) return decisions;

  for (const row of parseTsv(readFileSync(dataPath(file), "utf8"))) {
    const decision: Decision = {
      setStatus: value(row.setStatus),
      setJoined: value(row.setJoined),
      decision: value(row.decision),
    };
    if (!decision.setStatus && !decision.setJoined && !decision.decision) {
      continue;
    }
    for (const key of (row.records ?? "").split("|")) {
      const trimmed = key.trim();
      if (trimmed) decisions.set(trimmed, decision);
    }
  }
  return decisions;
}

export function findDecision(
  decisions: Decisions,
  records: string[],
): Decision | null {
  for (const key of records) {
    const decision = decisions.get(key);
    if (decision) return decision;
  }
  return null;
}

export function isSkip(decision: Decision | null): boolean {
  return SKIP.has((decision?.decision ?? "").toLowerCase());
}

export function isKeep(decision: Decision | null): boolean {
  return KEEP.has((decision?.decision ?? "").toLowerCase());
}

// "I looked, it is right." Distinct from SKIP, which discards the row.
const ACCEPTED = new Set(["ok", "correct", "keep", "rendben", "confirmed"]);

/** The record set a row was answered about, order-independent. */
function signature(records: string[]): string {
  return records
    .map((key) => key.trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

/**
 * Clusters signed off in a review file, keyed by their whole record set.
 *
 * The opposite of how decisions are indexed, and deliberately: an answer about a
 * person follows them into whatever cluster they end up in, but "I looked, these
 * two are one person" stops being true the moment a third record joins them.
 * Keyed per record, that sign-off would suppress the question forever.
 */
export function readAcknowledgements(file: string): Set<string> {
  const acknowledged = new Set<string>();
  if (!existsSync(dataPath(file))) return acknowledged;

  for (const row of parseTsv(readFileSync(dataPath(file), "utf8"))) {
    if (!ACCEPTED.has((row.decision ?? "").trim().toLowerCase())) continue;
    const key = signature((row.records ?? "").split("|"));
    if (key) acknowledged.add(key);
  }
  return acknowledged;
}

export function isAccepted(
  acknowledged: Set<string>,
  records: string[],
): boolean {
  return acknowledged.has(signature(records));
}
