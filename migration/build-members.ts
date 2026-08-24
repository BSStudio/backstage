import "dotenv/config";
import type { MembershipStatus } from "../app/generated/prisma/client";
import { done, fail, info, step } from "../scripts/utils";
import { MEMBERSHIP_STATUSES } from "../types";
import type { RawAuthentikUser } from "./extract-authentik";
import {
  loadIdAssignments,
  resolveMemberId,
  saveIdAssignments,
} from "./lib/ids";
import { readJsonIfExists, writeJson, writeText } from "./lib/paths";
import { loadSources, pickSheetRow, sortSheetRows } from "./lib/sources";
import { formatTsv, type TsvRow } from "./lib/tsv";
import type { DrupalUser } from "./load-drupal";
import type { Cluster } from "./match";
import type { SheetMember } from "./normalize-sheets";

/**
 * Resolves each cluster into the member row the import will write.
 *
 * Every field records which source won it, because "where did this value come
 * from" is the only question worth asking of a merge afterwards, and the
 * clusters are gone by then.
 */

type Field =
  | "firstName"
  | "lastName"
  | "nickname"
  | "email"
  | "mobile"
  | "university"
  | "major"
  | "dormRoom"
  | "status"
  | "joinedSemester"
  | "websiteUserId"
  | "archived";

export interface BuiltMember {
  id: string;
  idSource: "authentik" | "local";
  cluster: string;
  records: string[];

  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  mobile: string | null;
  university: string | null;
  major: string | null;
  dormRoom: string | null;

  status: MembershipStatus;
  joinedSemester: string;
  websiteUserId: string | null;
  archived: boolean;
  archivedAt: string | null;

  role: { label: string; authentikGroupIds: string[] } | null;
  provenance: Partial<Record<Field, string>>;
}

export interface RejectedCluster {
  cluster: string;
  records: string[];
  name: string;
  reasons: string[];
  detail: string;
}

interface Parts {
  cluster: Cluster;
  authentik: RawAuthentikUser | null;
  drupal: DrupalUser | null;
  sheet: SheetMember | null;
  sheetRows: SheetMember[];
}

function attribute(user: RawAuthentikUser | null, name: string): string | null {
  const value = user?.attributes?.[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * ALUMNI and ACTIVE_ALUMNI share one Authentik group, so the group alone cannot
 * tell them apart — only the Sheet distinguishes them.
 */
function statusGroups(): Map<string, MembershipStatus[]> {
  const byUuid = new Map<string, MembershipStatus[]>();
  const pairs: [MembershipStatus, string | undefined][] = [
    [
      "MEMBER_CANDIDATE_CANDIDATE",
      process.env.AUTHENTIK_GROUP_CANDIDATE_CANDIDATE,
    ],
    ["MEMBER_CANDIDATE", process.env.AUTHENTIK_GROUP_CANDIDATE],
    ["MEMBER", process.env.AUTHENTIK_GROUP_MEMBER],
    ["ACTIVE_ALUMNI", process.env.AUTHENTIK_GROUP_ALUMNI],
    ["ALUMNI", process.env.AUTHENTIK_GROUP_ALUMNI],
  ];
  for (const [status, uuid] of pairs) {
    if (!uuid) continue;
    byUuid.set(uuid, [...(byUuid.get(uuid) ?? []), status]);
  }
  return byUuid;
}

/** First source with a value wins; the name of that source is recorded. */
function firstOf<T>(candidates: [string, T | null | undefined][]): {
  value: T | null;
  from: string | null;
} {
  for (const [from, value] of candidates) {
    if (value !== null && value !== undefined && value !== "") {
      return { value, from };
    }
  }
  return { value: null, from: null };
}

function resolveStatus(
  parts: Parts,
  groups: Map<string, MembershipStatus[]>,
): { value: MembershipStatus | null; from: string | null } {
  const fromGroups = (parts.authentik?.groups ?? [])
    .flatMap((uuid) => groups.get(uuid) ?? [])
    .filter((status, index, all) => all.indexOf(status) === index);

  if (fromGroups.length === 1) {
    return { value: fromGroups[0], from: "authentik.groups" };
  }
  if (fromGroups.length > 1) {
    // The shared alumni group: the membership proves they are an alumnus but not
    // which kind. Only the Sheet marks someone Aktív öregtag, so without a row
    // saying so the plain ALUMNI is the honest answer.
    const sheet = sortSheetRows(parts.sheetRows).find(
      (row) => row.status && fromGroups.includes(row.status),
    );
    if (sheet?.status) {
      return { value: sheet.status, from: "authentik.groups + sheet" };
    }
    return {
      value: fromGroups.includes("ALUMNI") ? "ALUMNI" : fromGroups[0],
      from: "authentik.groups",
    };
  }

  return firstOf<MembershipStatus>([
    ["sheet", parts.sheet?.status ?? null],
    ["drupal", parts.drupal?.status ?? null],
  ]);
}

function resolveArchived(parts: Parts): { value: boolean; from: string } {
  if (parts.sheetRows.some((row) => row.tab === "current")) {
    return { value: false, from: "sheet.current" };
  }
  if (parts.authentik) {
    return { value: !parts.authentik.is_active, from: "authentik.is_active" };
  }
  if (parts.sheetRows.some((row) => row.tab === "alumni")) {
    return { value: false, from: "sheet.alumni" };
  }
  if (parts.drupal?.archived) return { value: true, from: "drupal.passive" };
  const archivedRow = parts.sheetRows.find((row) => row.archived);
  if (archivedRow) return { value: true, from: `sheet.${archivedRow.tab}` };
  return { value: false, from: "default" };
}

/** Groups the member is in beyond the ones the status and leadership drive. */
function roleGroups(parts: Parts, statusUuids: Set<string>): string[] {
  const leadership = process.env.AUTHENTIK_GROUP_LEADERSHIP_UUID;
  return (parts.authentik?.groups ?? []).filter(
    (uuid) => !statusUuids.has(uuid) && uuid !== leadership,
  );
}

async function main(): Promise<void> {
  const clusters = await readJsonIfExists<Cluster[]>("clusters.json");
  if (!clusters) fail("No data/clusters.json. Run migration/match.ts first.");
  const sources = await loadSources();
  const assignments = await loadIdAssignments();
  const groups = statusGroups();
  const statusUuids = new Set(groups.keys());
  const allowUnresolved = process.argv.includes("--allow-unresolved");

  const authentikByKey = new Map(
    sources.authentik.map((user) => [`authentik:${user.uuid}`, user]),
  );
  const drupalByKey = new Map(
    sources.drupal.map((user) => [`drupal:${user.uid}`, user]),
  );
  const sheetByKey = new Map(
    sources.sheet.map((member) => [member.key, member]),
  );

  const members: BuiltMember[] = [];
  const rejected: RejectedCluster[] = [];
  const rewritten: string[] = [];

  for (const cluster of clusters) {
    const sheetRows = cluster.sheet
      .map((key) => sheetByKey.get(key))
      .filter((row): row is SheetMember => Boolean(row));
    const parts: Parts = {
      cluster,
      authentik: cluster.authentik
        ? (authentikByKey.get(cluster.authentik) ?? null)
        : null,
      drupal: cluster.drupal ? (drupalByKey.get(cluster.drupal) ?? null) : null,
      sheet: sheetRows.length > 0 ? pickSheetRow(sheetRows) : null,
      sheetRows,
    };

    const provenance: Partial<Record<Field, string>> = {};
    const take = <T>(
      field: Field,
      candidates: [string, T | null | undefined][],
    ): T | null => {
      const { value, from } = firstOf(candidates);
      if (from) provenance[field] = from;
      return value;
    };

    const lastName = take<string>("lastName", [
      ["authentik.attributes", attribute(parts.authentik, "last_name")],
      ["sheet", parts.sheet?.lastName],
      ["drupal", parts.drupal?.fullname?.split(/\s+/)[0]],
    ]);
    const firstName = take<string>("firstName", [
      ["authentik.attributes", attribute(parts.authentik, "first_name")],
      ["sheet", parts.sheet?.firstName],
      ["drupal", parts.drupal?.fullname?.split(/\s+/).slice(1).join(" ")],
    ]);
    const email = take<string>("email", [
      ["authentik", parts.authentik?.email?.toLowerCase()],
      ["sheet", parts.sheet?.email],
      ["drupal", parts.drupal?.mail ?? parts.drupal?.profileEmail],
    ]);

    const status = resolveStatus(parts, groups);
    if (status.from) provenance.status = status.from;
    const joined = take<string>("joinedSemester", [
      ["sheet", parts.sheet?.joined.semester],
      ["drupal", parts.drupal?.joined.semester],
    ]);

    const reasons: string[] = [];
    if (!status.value) reasons.push("no status in any source");
    if (!email) reasons.push("no email address");
    if (!firstName || !lastName) reasons.push("no usable name");
    if (!joined) reasons.push("no join semester");

    if (reasons.length > 0) {
      const name =
        parts.sheet?.fullname ??
        parts.drupal?.fullname ??
        parts.authentik?.name ??
        cluster.key;
      rejected.push({
        cluster: cluster.key,
        records: cluster.records,
        name,
        reasons,
        detail: [
          parts.drupal ? `drupal state "${parts.drupal.stateRaw ?? ""}"` : null,
          parts.sheet
            ? `sheet ${parts.sheet.tab} "${parts.sheet.positionRaw ?? ""}"`
            : null,
          parts.drupal?.lastAccessAt
            ? `lastAccess ${parts.drupal.lastAccessAt.slice(0, 10)}`
            : null,
        ]
          .filter(Boolean)
          .join("  "),
      });
      continue;
    }

    const resolved = resolveMemberId(
      assignments,
      cluster.records,
      parts.authentik?.uuid ?? null,
    );
    if (resolved.rewrittenFrom) {
      rewritten.push(
        `${cluster.key}: ${resolved.rewrittenFrom} → ${resolved.id}`,
      );
    }

    const archived = resolveArchived(parts);
    provenance.archived = archived.from;
    const archivedYear = parts.sheetRows
      .map((row) => row.archivedYear)
      .filter((year): year is number => year !== null)
      .sort((a, b) => b - a)[0];

    const label = parts.sheet?.roleLabel ?? parts.drupal?.roleLabel ?? null;

    members.push({
      id: resolved.id,
      idSource: resolved.source,
      cluster: cluster.key,
      records: cluster.records,

      firstName: firstName as string,
      lastName: lastName as string,
      nickname: take<string>("nickname", [
        ["sheet", parts.sheet?.nickname],
        ["drupal", parts.drupal?.nickname],
      ]),
      email: email as string,
      mobile: take<string>("mobile", [
        ["authentik.attributes", attribute(parts.authentik, "mobile")],
        ["sheet", parts.sheet?.mobile],
        ["drupal", parts.drupal?.mobile],
      ]),
      university: take<string>("university", [
        ["sheet", parts.sheet?.university],
      ]),
      major: take<string>("major", [["sheet", parts.sheet?.major]]),
      dormRoom: take<string>("dormRoom", [["sheet", parts.sheet?.dormRoom]]),

      status: status.value as MembershipStatus,
      joinedSemester: joined as string,
      websiteUserId: take<string>("websiteUserId", [
        ["drupal", parts.drupal?.uid],
      ]),
      archived: archived.value,
      // Only the tab name dates an archival, and only to the year. The exact day
      // is not recorded anywhere and nothing depends on it.
      archivedAt:
        archived.value && archivedYear
          ? new Date(Date.UTC(archivedYear, 0, 1)).toISOString()
          : null,

      role: label
        ? { label, authentikGroupIds: roleGroups(parts, statusUuids) }
        : null,
      provenance,
    });
  }

  // ── Report ────────────────────────────────────────────────────────────────

  step("Built");
  info(`${members.length} members from ${clusters.length} clusters`);
  const byStatus = new Map<MembershipStatus, number>();
  for (const member of members) {
    byStatus.set(member.status, (byStatus.get(member.status) ?? 0) + 1);
  }
  for (const status of MEMBERSHIP_STATUSES) {
    info(`${String(byStatus.get(status) ?? 0).padStart(4)}  ${status}`);
  }
  info(`${members.filter((m) => m.archived).length} archived`);
  info(
    `${members.filter((m) => m.idSource === "authentik").length} keyed on an Authentik uuid`,
  );
  info(
    `${members.filter((m) => !m.websiteUserId).length} without a websiteUserId`,
  );
  info(`${members.filter((m) => m.role).length} with a leadership role`);

  step("Where each field came from");
  const fields: Field[] = [
    "firstName",
    "lastName",
    "email",
    "mobile",
    "status",
    "joinedSemester",
    "nickname",
    "archived",
  ];
  for (const field of fields) {
    const counts = new Map<string, number>();
    for (const member of members) {
      const from = member.provenance[field] ?? "(none)";
      counts.set(from, (counts.get(from) ?? 0) + 1);
    }
    const summary = [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([from, count]) => `${from} ${count}`)
      .join(", ");
    info(`${field.padEnd(16)} ${summary}`);
  }

  step(`Rejected — ${rejected.length}`);
  const reasonCounts = new Map<string, number>();
  for (const entry of rejected) {
    for (const reason of entry.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  for (const [reason, count] of [...reasonCounts].sort((a, b) => b[1] - a[1])) {
    info(`${String(count).padStart(4)}  ${reason}`);
  }
  for (const entry of rejected) {
    info(`  ${entry.name.padEnd(26)} ${entry.reasons.join(", ")}`);
    if (entry.detail)
      info(`      ${entry.detail}  [${entry.records.join(" ")}]`);
  }

  if (rewritten.length > 0) {
    step("Ids rewritten since the last run");
    info(
      "Harmless before the cutover; after it these need an UPDATE in place.",
    );
    for (const line of rewritten) info(`  ${line}`);
  }

  // ── Files ─────────────────────────────────────────────────────────────────

  const rejectedRows: TsvRow[] = rejected.map((entry) => ({
    name: entry.name,
    reasons: entry.reasons.join("; "),
    detail: entry.detail,
    records: entry.records.join(" | "),
    decision: "",
  }));

  info(await writeJson("members.json", members));
  info(
    await writeText(
      "rejected.tsv",
      formatTsv(rejectedRows, [
        "name",
        "reasons",
        "detail",
        "records",
        "decision",
      ]),
    ),
  );
  info(await saveIdAssignments(assignments));

  if (rejected.length > 0 && !allowUnresolved) {
    fail(
      `${rejected.length} clusters could not be built into a member.\n` +
        "  Fix them at the source and re-run, or pass --allow-unresolved to\n" +
        "  continue without them — they are listed in data/rejected.tsv either way.",
    );
  }

  done(`${members.length} members ready for import.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
