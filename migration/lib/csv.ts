export type CsvRow = string[];

/**
 * Reader for the Google Sheets exports.
 *
 * They are semicolon-separated and encoded in windows-1250, not UTF-8 — the
 * Hungarian double-acute letters (`ő` 0xF5, `ű` 0xFB) are the giveaway, and
 * decoding them as latin-1 turns them into `õ` and `û` silently.
 */
export function decodeSheet(bytes: Buffer): string {
  return new TextDecoder("windows-1250").decode(bytes);
}

export function parseCsv(contents: string, delimiter = ";"): CsvRow[] {
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
    } else if (character === delimiter) {
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
