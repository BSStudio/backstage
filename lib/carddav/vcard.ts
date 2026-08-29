import { createHash } from "node:crypto";

const CRLF = "\r\n";

// RFC 2426 counts the fold limit in octets, not characters, and Hungarian names are full
// of two-byte ones.
const MAX_OCTETS = 75;

export interface VCardMember {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  mobile: string | null;
  avatarUrl: string | null;
  updatedAt: Date;
}

export interface VCard {
  id: string;
  etag: string;
  body: string;
}

export interface AddressBook {
  cards: VCard[];
  ctag: string;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    // Every line after the first carries the space that marks it a continuation, and that
    // space counts toward the limit.
    const budget = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    let end = Math.min(offset + budget, bytes.length);
    // Never split a character down the middle: back off over continuation bytes.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
  }
  return parts.join(`${CRLF} `);
}

// vCard 3.0 rather than 4.0: it is what iOS, macOS and DAVx5 all read without negotiation.
export function renderVCard(
  member: VCardMember,
  options: { origin: string },
): string {
  const lines: (string | null)[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${escapeText(member.id)}`,
    `N:${escapeText(member.lastName)};${escapeText(member.firstName)};;;`,
    `FN:${escapeText(`${member.lastName} ${member.firstName}`)}`,
    member.nickname ? `NICKNAME:${escapeText(member.nickname)}` : null,
    `EMAIL;TYPE=INTERNET,PREF:${escapeText(member.email)}`,
    member.mobile ? `TEL;TYPE=CELL:${escapeText(member.mobile)}` : null,
    member.avatarUrl
      ? `PHOTO;VALUE=URI:${new URL(member.avatarUrl, options.origin).toString()}`
      : null,
    `REV:${member.updatedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
    "END:VCARD",
  ];

  return `${lines
    .filter((line) => line !== null)
    .map(foldLine)
    .join(CRLF)}${CRLF}`;
}

// Derived from the rendered card rather than from updatedAt, so it cannot claim a change
// the card does not show, or miss one it does.
function etagFor(body: string): string {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

export function buildAddressBook(
  members: VCardMember[],
  options: { origin: string },
): AddressBook {
  const cards = members.map((member) => {
    const body = renderVCard(member, options);
    return { id: member.id, body, etag: etagFor(body) };
  });

  // Folding the ids in too is what makes a removal move the ctag.
  const ctag = createHash("sha256")
    .update(cards.map((card) => `${card.id}:${card.etag}`).join("\n"))
    .digest("hex");

  return { cards, ctag };
}
