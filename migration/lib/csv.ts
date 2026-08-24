export type CsvRow = string[];

/**
 * Reader for the Google Sheets exports.
 *
 * Two shapes reach this: Sheets' own download is comma-separated UTF-8, while a
 * round trip through a Hungarian Excel produces semicolon-separated
 * windows-1250. Both are accepted, but neither is guessed at — decoding
 * windows-1250 as latin-1 turns `ő` and `ű` into `õ` and `û` without erroring,
 * and that is exactly the class of damage this file exists to prevent.
 */
export function decodeSheet(bytes: Buffer, name: string): string {
  const strict = new TextDecoder("utf-8", { fatal: true });
  let text: string;
  try {
    text = strict.decode(bytes);
  } catch {
    text = new TextDecoder("windows-1250").decode(bytes);
  }
  text = text.replace(/^﻿/, "");

  // U+FFFD is not an encoding to choose between — it is a character that was
  // already destroyed, by opening the file as the wrong codepage and saving it
  // back. No decoder recovers it, so the export has to be redone.
  const damaged = text.indexOf("�");
  if (damaged !== -1) {
    const around = text.slice(Math.max(0, damaged - 30), damaged + 30);
    throw new Error(
      `${name} contains U+FFFD replacement characters — its accented letters ` +
        `have been lost, not mis-decoded:
    …${around.replace(/\s+/g, " ")}…
` +
        "  Export the tab again from Google Sheets rather than re-saving this file.",
    );
  }

  return text;
}

/** Sheets writes commas, a Hungarian Excel writes semicolons. */
export function detectDelimiter(headerLine: string): string {
  const counts = [";", ",", "\t"].map(
    (candidate) =>
      [candidate, headerLine.split(candidate).length - 1] as [string, number],
  );
  const [best] = counts.sort((a, b) => b[1] - a[1]);
  return best[1] > 0 ? best[0] : ";";
}

export function parseCsv(contents: string, delimiter?: string): CsvRow[] {
  const separator =
    delimiter ?? detectDelimiter(contents.split(/\r?\n/, 1)[0] ?? "");

  const rows: CsvRow[] = [];
  let row: CsvRow = [];
  let field = "";
  let quoted = false;

  const endField = (): void => {
    row.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < contents.length; i++) {
    const character = contents[i];

    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (contents[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === separator) {
      endField();
    } else if (character === "\r") {
      // CRLF and bare CR both end the row; the LF is consumed with it.
      if (contents[i + 1] === "\n") i++;
      endRow();
    } else if (character === "\n") {
      endRow();
    } else {
      field += character;
    }
  }

  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Drops the trailing empty columns a Sheets export pads every row with. */
export function trimRow(row: CsvRow): CsvRow {
  const trimmed = [...row];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === "") {
    trimmed.pop();
  }
  return trimmed;
}
