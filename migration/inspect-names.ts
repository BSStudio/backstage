import "dotenv/config";
import { readFileSync } from "node:fs";
import { done, info, step } from "../scripts/utils";
import { dataPath, writeText } from "./lib/paths";
import { loadSources, type SourceRecord } from "./lib/sources";
import { normalizeName } from "./lib/text";
import { formatTsv, parseTsv, type TsvRow } from "./lib/tsv";

/**
 * Rows whose name looks written the wrong way round.
 *
 * A flipped name survives matching untouched — the name key sorts its tokens,
 * so "Barcza Emese" and "Emese Barcza" produce the same key — and then ruins
 * everything downstream: `firstName` and `lastName` land swapped on the member,
 * and `deriveUsername` derives from the wrong half. Nothing else in the
 * pipeline would notice.
 *
 * Two signals, and only one of them is trustworthy on its own.
 */

// Authentik's attributes are a verified split, not a guess at one.
const AUTHENTIK_WEIGHT = 5;

// A token that is overwhelmingly a given name sitting in the family-name slot,
// against a token that is overwhelmingly a family name in the given-name slot.
// Catches the flips the strict rule misses — most misses score 2 against 45 —
// at the cost of the occasional person whose family name is a common given one.
const LIKELY_RATIO = 10;
const LIKELY_FLOOR = 20;

const REVIEW_FILE = "name-order-review.tsv";

// Written into the `decision` column to say "checked, the name is right as it
// stands". A name the corpus cannot help with — a rare family name that is a
// common given name — would otherwise be raised on every single run.
const ACCEPTED = new Set(["ok", "correct", "keep", "rendben"]);

/**
 * Decisions already written into the review file, so re-running does not throw
 * them away. Keyed by record.
 */
function readDecisions(): Map<string, string> {
  const decisions = new Map<string, string>();
  try {
    for (const row of parseTsv(readFileSync(dataPath(REVIEW_FILE), "utf8"))) {
      const decision = (row.decision ?? "").trim();
      if (row.record && decision) decisions.set(row.record, decision);
    }
  } catch {
    // No previous run.
  }
  return decisions;
}

function isAccepted(decision: string | undefined): boolean {
  return ACCEPTED.has((decision ?? "").trim().toLowerCase());
}

interface Vocabulary {
  family: Map<string, number>;
  given: Map<string, number>;
}

function bump(counts: Map<string, number>, token: string, by: number): void {
  if (!token) return;
  counts.set(token, (counts.get(token) ?? 0) + by);
}

function tokensOf(record: SourceRecord): string[] {
  const name = [record.lastName, record.firstName].filter(Boolean).join(" ");
  return normalizeName(name).split(" ").filter(Boolean);
}

function buildVocabulary(records: SourceRecord[]): Vocabulary {
  const vocabulary: Vocabulary = { family: new Map(), given: new Map() };

  for (const record of records) {
    const tokens = tokensOf(record);
    if (tokens.length < 2) continue;
    const weight = record.splitVerified ? AUTHENTIK_WEIGHT : 1;
    bump(vocabulary.family, tokens[0], weight);
    bump(vocabulary.given, tokens[tokens.length - 1], weight);
  }

  return vocabulary;
}

interface Verdict {
  forward: number;
  reverse: number;
}

function judge(vocabulary: Vocabulary, tokens: string[]): Verdict {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];

  // The row's own vote is removed, or every name would corroborate itself.
  const family = (token: string): number =>
    Math.max(
      0,
      (vocabulary.family.get(token) ?? 0) - (token === first ? 1 : 0),
    );
  const given = (token: string): number =>
    Math.max(0, (vocabulary.given.get(token) ?? 0) - (token === last ? 1 : 0));

  return {
    forward: family(first) + given(last),
    reverse: given(first) + family(last),
  };
}

async function main(): Promise<void> {
  const sources = await loadSources();
  const vocabulary = buildVocabulary(sources.records);
  const showAmbiguous = process.argv.includes("--all");
  const decisions = readDecisions();

  // ── Signal 1: Authentik's own fields ──────────────────────────────────────

  step("Against Authentik's first_name / last_name attributes");
  const verified = new Map<string, SourceRecord>();
  for (const record of sources.records) {
    if (record.splitVerified) verified.set(record.nameKey, record);
  }

  const contradicted: TsvRow[] = [];
  for (const record of sources.records) {
    if (record.splitVerified) continue;
    const authentik = verified.get(record.nameKey);
    if (!authentik) continue;
    if (
      normalizeName(record.firstName) === normalizeName(authentik.firstName) &&
      normalizeName(record.lastName) === normalizeName(authentik.lastName)
    ) {
      continue;
    }
    contradicted.push({
      signal: "authentik",
      record: record.key,
      name: `${record.lastName} ${record.firstName}`,
      shouldBe: `${authentik.lastName} ${authentik.firstName}`,
      votes: "",
      decision: decisions.get(record.key) ?? "",
    });
  }
  info(
    `${verified.size} people have a verified split; ${contradicted.length} rows disagree with it`,
  );
  for (const row of contradicted) {
    info(`  ${row.record}  "${row.name}"  →  "${row.shouldBe}"`);
  }

  // ── Signal 2: the rest of the corpus ──────────────────────────────────────

  step("Against the rest of the corpus");
  const certain: TsvRow[] = [];
  const likely: TsvRow[] = [];
  let ambiguous = 0;
  // Kept out of the report but written back to the file. Dropping them would
  // re-raise the same names on the next run.
  const accepted: TsvRow[] = [];

  for (const record of sources.records) {
    // A verified split, or a name Authentik has already settled, needs no vote.
    if (record.splitVerified || verified.has(record.nameKey)) continue;
    const tokens = tokensOf(record);
    if (tokens.length < 2) continue;

    const verdict = judge(vocabulary, tokens);
    if (verdict.reverse <= verdict.forward) continue;

    // Hungarian family names and given names overlap heavily — Bálint, Máté,
    // Csaba, László and Péter are all both — so a bare majority calls a great
    // many correct names flipped.
    const decision = decisions.get(record.key);
    const row: TsvRow = {
      signal: "corpus",
      record: record.key,
      name: `${record.lastName} ${record.firstName}`,
      shouldBe: `${record.firstName} ${record.lastName}`,
      votes: `forward ${verdict.forward} vs reverse ${verdict.reverse}`,
      decision: decision ?? "",
    };

    if (isAccepted(decision)) {
      accepted.push({ ...row, signal: "corpus-accepted" });
    } else if (verdict.forward === 0) {
      certain.push(row);
    } else if (
      verdict.reverse >= LIKELY_RATIO * verdict.forward &&
      verdict.reverse >= LIKELY_FLOOR
    ) {
      likely.push({ ...row, signal: "corpus-likely" });
    } else {
      ambiguous++;
      if (showAmbiguous) likely.push({ ...row, signal: "corpus-ambiguous" });
    }
  }

  const show = (rows: TsvRow[]): void => {
    for (const row of rows) {
      info(
        `  ${row.record}  "${row.name}"  →  "${row.shouldBe}"  (${row.votes})`,
      );
    }
  };

  info(`${certain.length} put both tokens in a position nothing else uses`);
  show(certain);
  info(
    `${likely.filter((r) => r.signal === "corpus-likely").length} are lopsided ` +
      `enough to be worth a look (${LIKELY_RATIO}:1 or better)`,
  );
  show(likely.filter((r) => r.signal === "corpus-likely"));
  if (ambiguous > 0 && !showAmbiguous) {
    info(
      `${ambiguous} more read better reversed but use a token that is both a ` +
        "family and a given name elsewhere. Almost all of those are correct as " +
        "written — pass --all to see them.",
    );
  } else if (showAmbiguous) {
    show(likely.filter((r) => r.signal === "corpus-ambiguous"));
  }

  if (accepted.length > 0) {
    info(
      `${accepted.length} already marked correct in ${REVIEW_FILE}, not raised again`,
    );
  }

  const rows = [...contradicted, ...certain, ...likely, ...accepted];
  step("File");
  info(
    await writeText(
      REVIEW_FILE,
      formatTsv(rows, [
        "signal",
        "record",
        "name",
        "shouldBe",
        "votes",
        "decision",
      ]),
    ),
  );

  const open = rows.length - accepted.length;
  done(
    open === 0
      ? "No name reads as reversed."
      : `${open} names to check. Fix them at the source, not here — or write "ok" ` +
          `in the decision column of ${REVIEW_FILE} if the name was right all along.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
