import { describe, expect, it } from "vitest";
import {
  buildAddressBook,
  renderVCard,
  type VCardMember,
} from "@/lib/carddav/vcard";

const ORIGIN = "https://backstage.test";
const options = { origin: ORIGIN };

function member(overrides: Partial<VCardMember> = {}): VCardMember {
  return {
    id: "member-id",
    firstName: "János",
    lastName: "Kovács",
    nickname: null,
    email: "kovacs.janos@example.com",
    mobile: null,
    avatarUrl: null,
    updatedAt: new Date("2026-08-29T10:11:12.345Z"),
    ...overrides,
  };
}

/** Reverse RFC 2426 folding, so a value can be asserted whole. */
function unfold(body: string): string {
  return body.replace(/\r\n /g, "");
}

function lines(body: string): string[] {
  return unfold(body).split("\r\n").filter(Boolean);
}

describe("renderVCard", () => {
  it("carries the contact fields and nothing else, CRLF separated", () => {
    const body = renderVCard(member(), options);

    expect(body.endsWith("\r\n")).toBe(true);
    expect(lines(body)).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:member-id",
      "N:Kovács;János;;;",
      "FN:Kovács János",
      "EMAIL;TYPE=INTERNET,PREF:kovacs.janos@example.com",
      "REV:20260829T101112Z",
      "END:VCARD",
    ]);
  });

  it("leaves membership out of the card entirely", () => {
    const body = renderVCard(member(), options);

    for (const property of ["ORG", "TITLE", "CATEGORIES", "NOTE", "ADR"]) {
      expect(body).not.toContain(`${property}:`);
    }
  });

  it("adds the optional properties once the member has them", () => {
    const body = renderVCard(
      member({
        nickname: "Jani",
        mobile: "+36301234567",
        avatarUrl: "/avatars/member-id-square.webp",
      }),
      options,
    );

    expect(lines(body)).toContain("NICKNAME:Jani");
    expect(lines(body)).toContain("TEL;TYPE=CELL:+36301234567");
    expect(lines(body)).toContain(
      `PHOTO;VALUE=URI:${ORIGIN}/avatars/member-id-square.webp`,
    );
  });

  it("escapes the characters vCard gives its own meaning", () => {
    const body = renderVCard(member({ nickname: "A; B, C\\D\nE" }), options);

    expect(lines(body)).toContain("NICKNAME:A\\; B\\, C\\\\D\\nE");
  });

  it("folds a long line without splitting a multi-byte character", () => {
    const nickname = "ő".repeat(80);
    const body = renderVCard(member({ nickname }), options);

    const physical = body.split("\r\n").filter(Boolean);
    expect(physical.length).toBeGreaterThan(9);
    for (const line of physical) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // A split that landed mid-character would leave a replacement character behind.
    expect(unfold(body)).not.toContain("�");
    expect(lines(body)).toContain(`NICKNAME:${nickname}`);
  });
});

describe("buildAddressBook", () => {
  it("gives every card a quoted, content-derived etag", () => {
    const { cards } = buildAddressBook(
      [member(), member({ id: "other-id", email: "other@example.com" })],
      options,
    );

    expect(cards.map((card) => card.id)).toEqual(["member-id", "other-id"]);
    for (const card of cards) {
      expect(card.etag).toMatch(/^"[0-9a-f]{64}"$/);
    }
    expect(cards[0].etag).not.toBe(cards[1].etag);
  });

  it("repeats an etag for an unchanged member and moves it for a changed one", () => {
    const etagOf = (input: VCardMember) =>
      buildAddressBook([input], options).cards[0].etag;

    expect(etagOf(member())).toBe(etagOf(member()));
    expect(etagOf(member())).not.toBe(etagOf(member({ mobile: "+3612345" })));
  });

  it("moves the ctag when a card changes", () => {
    const before = buildAddressBook([member()], options).ctag;
    const after = buildAddressBook(
      [member({ nickname: "Jani" })],
      options,
    ).ctag;

    expect(after).not.toBe(before);
  });

  it("moves the ctag when a member leaves the book", () => {
    const both = buildAddressBook(
      [member(), member({ id: "other-id", email: "other@example.com" })],
      options,
    );
    const one = buildAddressBook([member()], options);

    expect(one.ctag).not.toBe(both.ctag);
    expect(both.ctag).toMatch(/^[0-9a-f]{64}$/);
  });
});
