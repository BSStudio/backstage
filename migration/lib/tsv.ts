/**
 * Reader and writer for `mysql --batch` output.
 *
 * Batch mode emits a header row and tab-separated values, escaping the
 * characters that would otherwise break the format (`\t`, `\n`, `\r`, `\0`,
 * `\\`) and printing SQL NULL as a bare `NULL`. A value that really is the
 * four-letter string "NULL" is indistinguishable from a null here — none of the
 * columns we read can legitimately hold it.
 */

const ESCAPES: Record<string, string> = {
  "0": "\0",
  n: "\n",
  r: "\r",
  t: "\t",
  "\\": "\\",
};

function unescapeField(field: string): string {
  let out = "";
  for (let i = 0; i < field.length; i++) {
    if (field[i] !== "\\" || i === field.length - 1) {
      out += field[i];
      continue;
    }
    const next = field[++i];
    out += ESCAPES[next] ?? next;
  }
  return out;
}

export type TsvRow = Record<string, string | null>;

export function parseTsv(contents: string): TsvRow[] {
  // A BOM would end up inside the first column's name and silently orphan it.
  const lines = contents.replace(/^\ufeff/, "").split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0) return [];

  const header = lines[0].replace(/\r$/, "").split("\t").map(unescapeField);

  return lines.slice(1).map((line) => {
    const fields = line.replace(/\r$/, "").split("\t");
    const row: TsvRow = {};
    header.forEach((column, index) => {
      const raw = fields[index];
      row[column] =
        raw === undefined || raw === "NULL" ? null : unescapeField(raw);
    });
    return row;
  });
}

const NEEDS_ESCAPE = /[\0\n\r\t\\]/g;

// Inverse of ESCAPES. Written out rather than derived, because deriving it puts
// a linear search inside a per-character replace for no gain in clarity.
const ESCAPED: Record<string, string> = {
  "\0": "\\0",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\\": "\\\\",
};

/** Same escaping as the reader expects, so a review file round-trips. */
export function formatTsv(rows: TsvRow[], columns: string[]): string {
  const escapeField = (value: string | null): string =>
    value === null
      ? "NULL"
      : value.replace(NEEDS_ESCAPE, (character) => ESCAPED[character]);

  const lines = [
    columns.join("\t"),
    ...rows.map((row) =>
      columns.map((column) => escapeField(row[column] ?? null)).join("\t"),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
