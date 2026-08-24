export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Lowercased, trimmed, diacritics kept. Returns null for anything unusable as a key. */
export function normalizeEmail(
  value: string | null | undefined,
): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed.includes("@")) return null;
  return trimmed;
}

/** Match key for names: diacritics stripped, punctuation dropped, whitespace collapsed. */
export function normalizeName(value: string | null | undefined): string {
  return stripDiacritics(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Both readings of a full name, as sorted-token keys.
 *
 * The sources disagree on order — Drupal's `profile_fullname` is Hungarian
 * ("Kovács János"), a spreadsheet column may be either — and compound family
 * names make a positional split unreliable. Sorting the tokens sidesteps the
 * question entirely for matching purposes; the authoritative first/last split
 * comes from Authentik attributes, not from here.
 */
export function nameKey(value: string | null | undefined): string {
  const tokens = normalizeName(value).split(" ").filter(Boolean);
  return tokens.sort().join(" ");
}

export function nameKeyFromParts(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return nameKey(`${lastName ?? ""} ${firstName ?? ""}`);
}

/**
 * Positional split of a Hungarian-order full name: first token is the family
 * name, the rest are given names. Wrong for compound family names written
 * without a hyphen — only ever a fallback for records with no Authentik side.
 */
export function splitHungarianFullName(fullname: string): {
  firstName: string;
  lastName: string;
} {
  const tokens = fullname.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: "", lastName: tokens[0] };
  return { firstName: tokens.slice(1).join(" "), lastName: tokens[0] };
}

// A guard against a four-digit number that is not a year at all — a room, a
// fragment of a phone number — and nothing more. It is deliberately wider than
// the roster: the studio predates the oldest member anyone has entered, and a
// bound drawn around the data would silently drop whoever turns out to be older
// than it. One alumna joined in 1982 while every other parsed year was 1996 or
// later.
const FIRST_PLAUSIBLE_YEAR = 1960;
const LAST_PLAUSIBLE_YEAR = 2100;

export type SemesterGuess = {
  semester: string | null;
  confidence: "exact" | "guessed" | "unknown";
  raw: string;
};

// Matched against a diacritic-stripped, lowercased value, so "ősz" arrives as
// "osz" and "március" as "marcius". Month names appear because the Sheet writes
// "2009 szept." where the website writes "2009 ősz". January counts as autumn,
// the same way `currentSemester()` treats it.
const AUTUMN = /(osz|szept|okt|nov|dec|jan|autumn|fall)/;
const SPRING = /(tavasz|febr|marc|apr|maj|jun|spring)/;

/**
 * Inverse of `buildJoinYearFromSemester`, tolerant of two decades of hand entry.
 * "2005 ősz" → 2005/2006/1, "2006 tavasz" → 2005/2006/2.
 */
export function semesterFromJoinYear(
  raw: string | null | undefined,
): SemesterGuess {
  const value = (raw ?? "").trim();
  const result = (
    semester: string | null,
    confidence: SemesterGuess["confidence"],
  ): SemesterGuess => ({ semester, confidence, raw: value });

  if (!value) return result(null, "unknown");

  // Already canonical.
  if (/^\d{4}\/\d{4}\/[12]$/.test(value)) return result(value, "exact");

  const normalized = stripDiacritics(value).toLowerCase();
  const years = normalized.match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length === 0) return result(null, "unknown");

  const year = years[0];
  if (year < FIRST_PLAUSIBLE_YEAR || year > LAST_PLAUSIBLE_YEAR) {
    return result(null, "unknown");
  }

  if (AUTUMN.test(normalized)) return result(`${year}/${year + 1}/1`, "exact");
  if (SPRING.test(normalized)) return result(`${year - 1}/${year}/2`, "exact");

  // A bare year. Recruitment runs in autumn, so that is the better guess — but
  // it is a guess, and the review sheet has to show it as one.
  return result(`${year}/${year + 1}/1`, "guessed");
}
