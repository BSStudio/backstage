import { deriveUsername } from "../../types";
import type { RawAuthentikUser } from "../extract-authentik";
import type { DrupalUser } from "../load-drupal";
import type { SheetMember } from "../normalize-sheets";
import { readJson } from "./paths";
import { SKIP_AUTHENTIK_USERNAMES } from "./skip";
import { nameKey, nameKeyFromParts, splitHungarianFullName } from "./text";

export type SourceKind = "authentik" | "drupal" | "sheet";

/**
 * The three exports reduced to the shape the matcher needs. Everything else
 * stays in the source-specific files and is looked up by key when the member
 * rows are built.
 */
export interface SourceRecord {
  key: string;
  kind: SourceKind;
  label: string;
  emails: string[];
  usernames: string[];
  nameKey: string;
  firstName: string | null;
  lastName: string | null;
}

export interface Sources {
  authentik: RawAuthentikUser[];
  drupal: DrupalUser[];
  sheet: SheetMember[];
  records: SourceRecord[];
  byKey: Map<string, SourceRecord>;
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function attribute(user: RawAuthentikUser, name: string): string | null {
  const value = user.attributes?.[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function fromAuthentik(user: RawAuthentikUser): SourceRecord {
  // `name` is written Western-order by createAuthentikUser, unlike every other
  // source here. The attributes are authoritative when present.
  const [first, ...rest] = user.name.trim().split(/\s+/).filter(Boolean);
  const firstName = attribute(user, "first_name") ?? first ?? null;
  const lastName = attribute(user, "last_name") ?? rest.join(" ") ?? null;

  return {
    key: `authentik:${user.uuid}`,
    kind: "authentik",
    label: `${user.username} <${user.email}>`,
    emails: unique([user.email?.toLowerCase()]),
    usernames: unique([
      user.username,
      firstName && lastName ? deriveUsername(firstName, lastName) : null,
    ]),
    nameKey: nameKeyFromParts(firstName, lastName) || nameKey(user.name),
    firstName,
    lastName,
  };
}

function fromDrupal(user: DrupalUser): SourceRecord {
  const { firstName, lastName } = splitHungarianFullName(user.fullname ?? "");

  return {
    key: `drupal:${user.uid}`,
    kind: "drupal",
    label: `uid ${user.uid} ${user.fullname ?? user.username}`,
    emails: unique([user.mail, user.init, user.profileEmail]),
    usernames: unique([
      user.username,
      firstName && lastName ? deriveUsername(firstName, lastName) : null,
    ]),
    nameKey: nameKey(user.fullname) || nameKey(user.username),
    firstName: firstName || null,
    lastName: lastName || null,
  };
}

function fromSheet(member: SheetMember): SourceRecord {
  return {
    key: member.key,
    kind: "sheet",
    label: `${member.tab}:${member.rowNumber} ${member.fullname}`,
    emails: unique([member.email]),
    usernames: unique([
      member.firstName && member.lastName
        ? deriveUsername(member.firstName, member.lastName)
        : null,
    ]),
    nameKey: nameKey(member.fullname),
    firstName: member.firstName || null,
    lastName: member.lastName || null,
  };
}

export async function loadSources(): Promise<Sources> {
  const [authentikAll, drupalAll, sheet] = await Promise.all([
    readJson<RawAuthentikUser[]>("authentik-users.json"),
    readJson<DrupalUser[]>("drupal-users.json"),
    readJson<SheetMember[]>("sheet-members.json"),
  ]);

  // Service accounts are not people; neither are the built-in administrator and
  // the test account, which both carry type "internal".
  const authentik = authentikAll.filter(
    (user) =>
      user.type === "internal" && !SKIP_AUTHENTIK_USERNAMES.has(user.username),
  );
  const drupal = drupalAll.filter((user) => !user.skip);

  const records = [
    ...authentik.map(fromAuthentik),
    ...drupal.map(fromDrupal),
    ...sheet.map(fromSheet),
  ];

  return {
    authentik,
    drupal,
    sheet,
    records,
    byKey: new Map(records.map((record) => [record.key, record])),
  };
}
