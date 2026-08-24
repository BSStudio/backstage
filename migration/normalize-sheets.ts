import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import type { MembershipStatus } from "../app/generated/prisma/client";
import { done, fail, info, step } from "../scripts/utils";
import { decodeSheet, parseCsv, trimRow } from "./lib/csv";
import { dataPath, writeJson } from "./lib/paths";
import { statusFromSheetPosition } from "./lib/status";
import {
  normalizeEmail,
  type SemesterGuess,
  semesterFromJoinYear,
  splitHungarianFullName,
} from "./lib/text";

/**
 * Every tab has the same ten columns in the same order, so they are read by
 * position rather than by header: the first header cell is a stray "f"/"i" in
 * two of the tabs, and the address and phone columns carry different titles per
 * tab.
 */
const COLUMN = {
  fullname: 0,
  position: 1,
  nickname: 2,
  joined: 3,
  university: 4,
  svie: 5,
  address: 6,
  mobile: 7,
  email: 8,
  note: 9,
  alumniSince: 10,
} as const;

// The address column says where the member lives, not whether they are external
// to the studio: "külsős" means they have no dorm room.
const NO_DORM = new Set(["kulsos", "nincs", "-", "?"]);

// Placeholders a human typed to mean "nothing here".
const NO_VALUE = new Set(["-", "--", "?", "n/a", "na", "nincs", "-.-"]);

// "Stúdiós jelölt (inaktív)" — only ever on the year-unknown archived tab, where
// the tab already says they are archived.
const INACTIVE_SUFFIX = /\s*\(inakt[ií]v\)\s*$/i;

// "Stúdiós - Stúdióvezető" packs a status and a leadership role into one cell.
const STATUS_ROLE_SEPARATOR = " - ";

const INSTITUTION = /^[A-ZÁÉÍÓÖŐÚÜŰ]{2,}(-[A-ZÁÉÍÓÖŐÚÜŰ]{2,})?$/;
const INSTITUTION_THEN_MAJOR =
  /^([A-ZÁÉÍÓÖŐÚÜŰ]{2,}-[A-ZÁÉÍÓÖŐÚÜŰ]{2,})\s+(.+)$/;

export interface SheetMember {
  key: string;
  tab: string;
  rowNumber: number;

  fullname: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string | null;
  mobile: string | null;

  university: string | null;
  major: string | null;
  dormRoom: string | null;

  positionRaw: string | null;
  status: MembershipStatus | null;
  roleLabel: string | null;
  inactive: boolean;
  joined: SemesterGuess;

  archived: boolean;
  archivedYear: number | null;
  alumniSince: string | null;
  note: string | null;
}

function text(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "" || NO_VALUE.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

interface Position {
  status: MembershipStatus | null;
  roleLabel: string | null;
  inactive: boolean;
}

/**
 * The `Pozíció` column carries up to three things in one cell: a membership
 * status, a leadership role, and an "(inaktív)" marker. Nothing but the value
 * distinguishes them, so a cell that resolves to no status at all is treated as
 * a bare role label and left for the review file to classify.
 */
function parsePosition(raw: string | null): Position {
  if (!raw) return { status: null, roleLabel: null, inactive: false };

  const inactive = INACTIVE_SUFFIX.test(raw);
  const value = raw.replace(INACTIVE_SUFFIX, "").trim();
  const collapse = (part: string): string | null =>
    text(part.replace(/\s+/g, " "));

  const separator = value.indexOf(STATUS_ROLE_SEPARATOR);
  if (separator !== -1) {
    const head = statusFromSheetPosition(value.slice(0, separator));
    if (head) {
      return {
        status: head,
        roleLabel: collapse(
          value.slice(separator + STATUS_ROLE_SEPARATOR.length),
        ),
        inactive,
      };
    }
  }

  const status = statusFromSheetPosition(value);
  return {
    status,
    roleLabel: status ? null : collapse(value),
    inactive,
  };
}

interface Studies {
  university: string | null;
  major: string | null;
  split: boolean;
}

/**
 * "BME-VIK, villany" and "BME-VIK info" both split into institution + major;
 * "ELTE-BTK" is an institution on its own. Anything else stays whole in
 * `university` and gets reported rather than split on a guess.
 */
function splitStudies(value: string | null): Studies {
  if (!value) return { university: null, major: null, split: true };

  const comma = value.indexOf(",");
  if (comma !== -1) {
    return {
      university: text(value.slice(0, comma)),
      major: text(value.slice(comma + 1)),
      split: true,
    };
  }

  const spaced = value.match(INSTITUTION_THEN_MAJOR);
  if (spaced) {
    return { university: spaced[1], major: text(spaced[2]), split: true };
  }

  if (INSTITUTION.test(value)) {
    return { university: value, major: null, split: true };
  }

  return { university: value, major: null, split: false };
}

function dormRoom(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return NO_DORM.has(normalized) ? null : value;
}

function archivalOf(tab: string): { archived: boolean; year: number | null } {
  if (tab === "current" || tab === "alumni") {
    return { archived: false, year: null };
  }
  const year = tab.match(/^archived_(\d{4})$/)?.[1];
  return { archived: true, year: year ? Number(year) : null };
}

function build(tab: string, row: string[], rowNumber: number): SheetMember {
  const fullname = (row[COLUMN.fullname] ?? "").trim();
  const { firstName, lastName } = splitHungarianFullName(fullname);
  const studies = splitStudies(text(row[COLUMN.university]));
  const positionRaw = text(row[COLUMN.position]);
  const position = parsePosition(positionRaw);
  const { archived, year } = archivalOf(tab);

  return {
    key: `sheet:${tab}:${rowNumber}`,
    tab,
    rowNumber,

    fullname,
    firstName,
    lastName,
    nickname: text(row[COLUMN.nickname]),
    email: normalizeEmail(row[COLUMN.email]),
    mobile: text(row[COLUMN.mobile]),

    university: studies.university,
    major: studies.major,
    dormRoom: dormRoom(text(row[COLUMN.address])),

    positionRaw,
    status: position.status,
    roleLabel: position.roleLabel,
    inactive: position.inactive,
    joined: semesterFromJoinYear(row[COLUMN.joined]),

    archived,
    archivedYear: year,
    alumniSince: text(row[COLUMN.alumniSince]),
    note: text(row[COLUMN.note]),
  };
}

function tally(values: (string | null)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value ?? "(empty)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

async function main(): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(dataPath("sheets")))
      .filter((name) => name.endsWith(".csv"))
      .sort();
  } catch {
    return fail("No data/sheets/. Export each tab as CSV there first.");
  }
  if (files.length === 0) fail("data/sheets/ holds no .csv files.");

  step("Reading tabs");
  const members: SheetMember[] = [];
  const unsplitStudies: string[] = [];

  for (const file of files) {
    const tab = file.replace(/\.csv$/, "");
    const rows = parseCsv(
      decodeSheet(await readFile(dataPath("sheets", file)), file),
    );
    let kept = 0;

    // Row 1 is the header; rowNumber stays 1-based so it matches the spreadsheet.
    rows.slice(1).forEach((raw, index) => {
      const row = trimRow(raw);
      if (row.length === 0 || (row[COLUMN.fullname] ?? "").trim() === "")
        return;
      const member = build(tab, row, index + 2);
      if (!splitStudies(text(row[COLUMN.university])).split) {
        unsplitStudies.push(`${member.fullname}: ${member.university}`);
      }
      members.push(member);
      kept++;
    });

    const { archived, year } = archivalOf(tab);
    const suffix = archived
      ? `  archived${year ? ` ${year}` : " (year unknown)"}`
      : "";
    info(`${tab.padEnd(16)} ${String(kept).padStart(3)} members${suffix}`);
  }

  step(`Pozíció — ${members.length} rows`);
  for (const [value, count] of tally(members.map((m) => m.positionRaw))) {
    const parsed = parsePosition(value === "(empty)" ? null : value);
    const parts = [
      parsed.status ?? "no status",
      parsed.roleLabel ? `role "${parsed.roleLabel}"` : null,
      parsed.inactive ? "inactive" : null,
    ].filter(Boolean);
    const label = value.replace(/\s+/g, " ");
    info(
      `${String(count).padStart(4)}  ${label.padEnd(38)} → ${parts.join(", ")}`,
    );
  }

  const unclassified = members.filter((m) => !m.status);
  info(
    `${unclassified.length} rows with no status — these reach the review file`,
  );

  step("Join year");
  const guessed = members.filter((m) => m.joined.confidence === "guessed");
  const unknown = members.filter((m) => m.joined.confidence === "unknown");
  info(
    `${members.length - guessed.length - unknown.length} exact, ` +
      `${guessed.length} guessed, ${unknown.length} unparseable`,
  );

  step("Emails");
  const withoutEmail = members.filter((m) => !m.email);
  info(`${withoutEmail.length} rows with no email address`);
  for (const member of withoutEmail) {
    info(`  ${member.key}  ${member.fullname}`);
  }

  const byEmail = new Map<string, SheetMember[]>();
  for (const member of members) {
    if (!member.email) continue;
    byEmail.set(member.email, [...(byEmail.get(member.email) ?? []), member]);
  }
  const repeated = [...byEmail].filter(([, rows]) => rows.length > 1);
  info(`${repeated.length} addresses appear on more than one tab`);
  for (const [, rows] of repeated.slice(0, 15)) {
    info(`  ${rows[0].fullname}: ${rows.map((r) => r.tab).join(" + ")}`);
  }
  if (repeated.length > 15) info(`  … and ${repeated.length - 15} more`);

  step("Studies not split into university + major");
  info(`${unsplitStudies.length} rows`);
  for (const entry of unsplitStudies.slice(0, 15)) info(`  ${entry}`);
  if (unsplitStudies.length > 15) {
    info(`  … and ${unsplitStudies.length - 15} more`);
  }

  info(await writeJson("sheet-members.json", members));
  done(`${members.length} sheet rows normalized.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
