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

export interface MobileCheck {
  /** Cleaned number, or null when the field held a placeholder. */
  value: string | null;
  raw: string;
  /** What changed, or what a human should look at. */
  note: string | null;
}

const HUNGARIAN_MOBILE_DIGITS = 9;
const NOT_A_DIGIT = /[^0-9]/g;
const LINE_BREAK = /[\r\n]+/;
const SIX_REPEATS = /(\d)\1{5,}/;
const FOUR_REPEATS = /(\d)\1{3,}/;
const KEYPAD_WALK = /012345|123456|987654/;

/**
 * Cleans one mobile number out of a Drupal field that was mandatory.
 *
 * Being mandatory is the whole problem: everyone who did not want to give a
 * number typed something, and the something is usually a run of the same digit
 * or a walk up the keypad. Those become null rather than being carried into
 * Authentik, where a placeholder looks exactly like a real contact.
 *
 * Only shapes that cannot be a number are dropped. One that merely looks odd is
 * kept and flagged — losing a real number is worse than keeping a doubtful one
 * somebody can check.
 */
export function normalizeMobile(raw: string | null | undefined): MobileCheck {
  const original = (raw ?? "").trim();
  const check = (value: string | null, note: string | null): MobileCheck => ({
    value,
    raw: original,
    note,
  });
  const withExtra = (
    note: string | null,
    extra: string | null,
  ): string | null => [extra, note].filter(Boolean).join("; ") || null;

  if (!original) return check(null, null);

  // A field holding several numbers keeps the first; the rest are usually a
  // second country's number nobody uses for the studio.
  const lines = original.split(LINE_BREAK).filter((line) => line.trim() !== "");
  const first = lines[0].trim();
  const extra =
    lines.length > 1 ? `dropped ${lines.length - 1} further number(s)` : null;

  const international = first.startsWith("+") || first.startsWith("00");
  let digits = first.replace(NOT_A_DIGIT, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const local = digits.replace(/^36/, "").replace(/^06/, "");

  if (new Set(local).size <= 2 || SIX_REPEATS.test(local)) {
    return check(null, "placeholder: barely any distinct digits");
  }
  if (KEYPAD_WALK.test(local)) {
    return check(null, "placeholder: sequential digits");
  }

  // Short of the run that drops a number, but still worth a glance: a real one
  // rarely carries four of the same digit in a row.
  const odd = FOUR_REPEATS.test(local)
    ? "unusual run of repeated digits — worth checking"
    : null;

  // A bare Hungarian number, written 30/555-0123 or 06 30 555 0123.
  if (!international && local.length === HUNGARIAN_MOBILE_DIGITS) {
    return check(
      `+36${local}`,
      withExtra(odd ?? "added the +36 prefix", extra),
    );
  }
  if (digits.length === 11 && digits.startsWith("36")) {
    return check(`+${digits}`, withExtra(odd, extra));
  }
  if (international) return check(`+${digits}`, withExtra(odd, extra));

  return check(first, withExtra("not a recognisable mobile number", extra));
}
