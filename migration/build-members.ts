import "dotenv/config";
import type { MembershipStatus } from "../app/generated/prisma/client";
import { done, fail, info, step } from "../scripts/utils";
import { MEMBERSHIP_STATUSES, parseSemester } from "../types";
import type { RawAuthentikGroup, RawAuthentikUser } from "./extract-authentik";
import {
  type Decision,
  findDecision,
  isKeep,
  isSkip,
  readDecisions,
} from "./lib/decisions";
import {
  loadIdAssignments,
  resolveMemberId,
  saveIdAssignments,
} from "./lib/ids";
import { readJsonIfExists, writeJson, writeText } from "./lib/paths";
import { loadSources, pickSheetRow, sortSheetRows } from "./lib/sources";
import { normalizeMobile } from "./lib/text";
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
  | "archived"
  | "archivedAt";

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
  /** True when `archivedAt` was inferred rather than recorded anywhere. */
  archivedAtEstimated: boolean;

  role: { label: string; authentikGroupIds: string[] } | null;
  provenance: Partial<Record<Field, string>>;
}

export interface RejectedCluster {
  cluster: string;
  records: string[];
  name: string;
  reasons: string[];
  detail: string;
  suggestedJoined: string;
  basis: string;
}

const REJECTED_FILE = "rejected.tsv";
const OVERRIDES_FILE = "member-overrides.json";

/**
 * Corrections to a member the sources agree on and a human says are wrong.
 *
 * Distinct from `rejected.tsv`, which answers members the build could not
 * finish: these are complete and merely incorrect. Keyed by any record on the
 * cluster, so it survives the cluster re-keying when a source is added.
 *
 * Worth saying out loud when one is used: the sources still disagree. An
 * override moves Backstage and leaves Authentik and the website saying what they
 * said, so the durable fix is usually to change them instead.
 */
interface MemberOverride {
  status?: MembershipStatus;
  archived?: boolean;
  archivedAt?: string;
  note?: string;
}

/**
 * People who are recorded somewhere but were never really members.
 *
 * Both cases are decided rather than incomplete, so they are dropped without
 * being counted as problems and without chasing the fields they are missing —
 * asking for a join semester nobody wrote down, for someone nobody will look
 * up, is work for its own sake. `KEEP` in the decision column brings one back.
 */
function ignoreReason(
  parts: Parts,
  status: MembershipStatus | null,
): string | null {
  if (!status) {
    // Every system that knows them declined to say what they were. The website
    // is where that gets fixed, and it has been.
    return "no status in any source";
  }
  if (
    !parts.authentik &&
    !parts.drupal &&
    status === "MEMBER_CANDIDATE_CANDIDATE"
  ) {
    return "candidate-candidate no other system ever saw";
  }
  return null;
}

/**
 * How long someone at each rung typically lasted before drifting away.
 *
 * Used only when nothing recorded an archival date — 57 members are archived
 * purely because Drupal has them passive, and the website never stored when that
 * happened. A member page reading "archived, date unknown" is worse than one
 * carrying an estimate that is marked as an estimate, so the estimate is made
 * here and flagged in `provenance` and in the audit diff rather than passed off
 * as a recorded fact.
 */
const YEARS_BEFORE_LEAVING: Record<MembershipStatus, number> = {
  MEMBER_CANDIDATE_CANDIDATE: 1,
  MEMBER_CANDIDATE: 2,
  MEMBER: 4,
  // Never reached by the current data — no alumnus is archived without a date —
  // but kept at the member's figure rather than below it, since someone who got
  // as far as alumnus did not leave sooner than someone who did not.
  ACTIVE_ALUMNI: 4,
  ALUMNI: 4,
};

/**
 * A date inside the year a sheet tab names.
 *
 * The tab says someone was archived in 2017, not on the first day of it, and
 * archival happens in roughly two batches a year — so the middle of the year is
 * the least-wrong single point. Someone who joined that same autumn cannot have
 * been archived in July, so they take the end of the year instead.
 */
function dateWithinYear(year: number, joinedSemester: string): Date {
  const midYear = new Date(Date.UTC(year, 6, 1));
  const joined = semesterStart(joinedSemester);
  if (midYear >= joined) return midYear;

  const yearEnd = new Date(Date.UTC(year, 11, 31));
  return yearEnd >= joined ? yearEnd : joined;
}

function estimateArchivedAt(
  joinedSemester: string,
  status: MembershipStatus,
): Date {
  const start = semesterStart(joinedSemester);
  const estimate = new Date(start);
  estimate.setUTCFullYear(
    start.getUTCFullYear() + YEARS_BEFORE_LEAVING[status],
  );
  // Nobody left in the future.
  const now = new Date();
  return estimate > now ? now : estimate;
}

/** The first day of a semester. */
function semesterStart(semester: string): Date {
  const { startYear, endYear, number } = parseSemester(semester);
  return number === 1
    ? new Date(Date.UTC(startYear, 8, 1))
    : new Date(Date.UTC(endYear, 1, 1));
}

/** The semester an ISO date falls in, on the same Sept-or-January rule as `currentSemester()`. */
function semesterOfDate(iso: string): string {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (month >= 9 || month === 1) {
    const start = month === 1 ? year - 1 : year;
    return `${start}/${start + 1}/1`;
  }
  return `${year - 1}/${year}/2`;
}

/**
 * A join semester worth *offering*, never one worth applying unasked.
 *
 * A Drupal account made the week someone joined dates their joining well. One
 * backfilled during this migration dates nothing at all — the alumna whose
 * account was created yesterday would come out as having joined this semester.
 * So the basis is printed alongside and a person decides.
 */
function suggestJoined(parts: Parts): { semester: string; basis: string } {
  if (parts.drupal?.createdAt) {
    return {
      semester: semesterOfDate(parts.drupal.createdAt),
      basis: `drupal account created ${parts.drupal.createdAt.slice(0, 10)}`,
    };
  }
  const year = parts.sheetRows
    .map((row) => row.archivedYear)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[0];
  if (year) {
    return {
      semester: `${year - 1}/${year}/1`,
      basis: `archived in ${year}, so joined no later than that`,
    };
  }
  return { semester: "", basis: "" };
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

/**
 * Groups a leadership role is responsible for granting.
 *
 * Everything a role does not own has to come out, and that is more than the
 * status groups: `Admin` and the API-client group carry permissions of their
 * own, and `Vezetőség` is added by the sync layer for every role. Leaving any of
 * them in means removing someone's role calls REMOVE_FROM_GROUP on it — so
 * ending a role would quietly strip that member's admin access.
 *
 * The permission groups are configured by *name*, so they are resolved through
 * the Authentik snapshot rather than read as UUIDs.
 */
function reservedGroupUuids(
  groups: RawAuthentikGroup[],
  statusUuids: Set<string>,
): Set<string> {
  const byName = new Map(groups.map((group) => [group.name, group.pk]));
  const reserved = new Set(statusUuids);

  for (const uuid of [process.env.AUTHENTIK_GROUP_LEADERSHIP_UUID]) {
    if (uuid) reserved.add(uuid);
  }
  for (const variable of [
    "AUTHENTIK_GROUP_ADMIN",
    "AUTHENTIK_GROUP_LEADERSHIP",
    "AUTHENTIK_GROUP_API_CLIENTS",
  ]) {
    const uuid = byName.get(process.env[variable] ?? "");
    if (uuid) reserved.add(uuid);
  }
  return reserved;
}

function roleGroups(parts: Parts, reserved: Set<string>): string[] {
  return (parts.authentik?.groups ?? []).filter((uuid) => !reserved.has(uuid));
}

async function main(): Promise<void> {
  const clusters = await readJsonIfExists<Cluster[]>("clusters.json");
  if (!clusters) fail("No data/clusters.json. Run migration/match.ts first.");
  const sources = await loadSources();
  const assignments = await loadIdAssignments();
  const groups = statusGroups();
  const authentikGroups =
    (await readJsonIfExists<RawAuthentikGroup[]>("authentik-groups.json")) ??
    [];
  const reserved = reservedGroupUuids(authentikGroups, new Set(groups.keys()));
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

  const decisions = readDecisions(REJECTED_FILE);
  const overrides =
    (await readJsonIfExists<Record<string, MemberOverride>>(OVERRIDES_FILE)) ??
    {};
  const overrideNotes: string[] = [];
  const members: BuiltMember[] = [];
  const rejected: RejectedCluster[] = [];
  const skipped: RejectedCluster[] = [];
  const ignoredEntries: { entry: RejectedCluster; why: string }[] = [];
  const rewritten: string[] = [];
  const droppedRoles: string[] = [];
  const mobileNotes: string[] = [];
  let estimatedArchivals = 0;

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

    const decision: Decision | null = findDecision(decisions, cluster.records);

    const status = resolveStatus(parts, groups);
    if (decision?.setStatus) {
      status.value = decision.setStatus as MembershipStatus;
      status.from = REJECTED_FILE;
    }
    if (status.from) provenance.status = status.from;

    let joined = take<string>("joinedSemester", [
      ["sheet", parts.sheet?.joined.semester],
      ["drupal", parts.drupal?.joined.semester],
    ]);
    if (decision?.setJoined) {
      joined = decision.setJoined;
      provenance.joinedSemester = REJECTED_FILE;
    }

    const ignored = isKeep(decision) ? null : ignoreReason(parts, status.value);

    const reasons: string[] = [];
    if (!ignored) {
      if (!status.value) reasons.push("no status in any source");
      if (!email) reasons.push("no email address");
      if (!firstName || !lastName) reasons.push("no usable name");
      if (!joined) reasons.push("no join semester");
    }

    if (reasons.length > 0 || ignored || isSkip(decision)) {
      const name =
        parts.sheet?.fullname ??
        parts.drupal?.fullname ??
        parts.authentik?.name ??
        cluster.key;
      const suggestion = suggestJoined(parts);
      const entry: RejectedCluster = {
        cluster: cluster.key,
        records: cluster.records,
        name,
        reasons,
        suggestedJoined: reasons.includes("no join semester")
          ? suggestion.semester
          : "",
        basis: reasons.includes("no join semester") ? suggestion.basis : "",
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
      };
      if (ignored) {
        ignoredEntries.push({ entry, why: ignored });
      } else if (isSkip(decision)) {
        skipped.push(entry);
      } else {
        rejected.push(entry);
      }
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

    const override = cluster.records.map((key) => overrides[key]).find(Boolean);

    if (override?.status) {
      status.value = override.status;
      status.from = OVERRIDES_FILE;
      provenance.status = OVERRIDES_FILE;
    }

    const archived = resolveArchived(parts);
    if (override?.archived !== undefined) {
      archived.value = override.archived;
      archived.from = OVERRIDES_FILE;
    }
    provenance.archived = archived.from;
    const archivedYear = parts.sheetRows
      .map((row) => row.archivedYear)
      .filter((year): year is number => year !== null)
      .sort((a, b) => b - a)[0];

    const archivedDate = !archived.value
      ? null
      : archivedYear !== undefined
        ? dateWithinYear(archivedYear, joined as string)
        : estimateArchivedAt(
            joined as string,
            status.value as MembershipStatus,
          );
    if (override) {
      overrideNotes.push(
        `${lastName} ${firstName}: ${JSON.stringify(override)}`,
      );
    }
    if (archived.value) {
      provenance.archivedAt =
        archivedYear !== undefined
          ? `sheet tab ${archivedYear}, dated within the year`
          : `estimated: joined + ${YEARS_BEFORE_LEAVING[status.value as MembershipStatus]} years`;
      if (archivedYear === undefined) estimatedArchivals++;
    }

    // LeadershipRole rows are only ever *current* ones — a role that ended is a
    // TimelineEntry instead. An archived member holding one would show as
    // leadership in the UI and be synced into the Leadership group.
    const recordedLabel =
      parts.sheet?.roleLabel ?? parts.drupal?.roleLabel ?? null;
    const label = archived.value ? null : recordedLabel;

    const mobile = normalizeMobile(
      take<string>("mobile", [
        ["authentik.attributes", attribute(parts.authentik, "mobile")],
        ["sheet", parts.sheet?.mobile],
        ["drupal", parts.drupal?.mobile],
      ]),
    );
    if (mobile.note) {
      mobileNotes.push(
        `${lastName} ${firstName}: "${mobile.raw}" → ${mobile.value ?? "dropped"} (${mobile.note})`,
      );
    }
    if (!mobile.value) provenance.mobile = undefined;
    if (archived.value && recordedLabel) {
      droppedRoles.push(`${lastName} ${firstName}: "${recordedLabel}"`);
    }

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
      mobile: mobile.value,
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
      // A sheet tab dates an archival to the year and nothing dates the rest, so
      // the remainder is estimated from how long that rung usually lasts.
      archivedAt: archived.value ? (archivedDate?.toISOString() ?? null) : null,
      archivedAtEstimated: archived.value && archivedYear === undefined,

      role: label
        ? { label, authentikGroupIds: roleGroups(parts, reserved) }
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

  if (ignoredEntries.length > 0) {
    step(`Not really members — ${ignoredEntries.length}`);
    info("write KEEP in the decision column to import one anyway");
    const byReason = new Map<string, string[]>();
    for (const { entry, why } of ignoredEntries) {
      byReason.set(why, [...(byReason.get(why) ?? []), entry.name]);
    }
    for (const [why, names] of byReason) {
      info(`${String(names.length).padStart(4)}  ${why}`);
      for (const name of names) info(`        ${name}`);
    }
  }

  if (skipped.length > 0) {
    step(`Skipped on purpose — ${skipped.length}`);
    info(`marked in ${REJECTED_FILE}; not counted as a problem`);
    for (const entry of skipped) info(`  ${entry.name}`);
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
    if (entry.detail) {
      info(`      ${entry.detail}  [${entry.records.join(" ")}]`);
    }
    if (entry.suggestedJoined) {
      info(`      suggests ${entry.suggestedJoined} — ${entry.basis}`);
    }
  }
  if (rejected.length > 0) {
    info(
      `Fill setStatus / setJoined in ${REJECTED_FILE} to resolve a row, or write ` +
        "SKIP in decision to drop the person for good. The file is read back " +
        "before it is rewritten, so answers survive a re-run.",
    );
  }

  // A number two people both "have" is not a number either of them has. The
  // Drupal field was mandatory, so the same placeholder got typed repeatedly.
  const sharedMobiles = new Map<string, BuiltMember[]>();
  for (const member of members) {
    if (!member.mobile) continue;
    sharedMobiles.set(member.mobile, [
      ...(sharedMobiles.get(member.mobile) ?? []),
      member,
    ]);
  }
  const shared = [...sharedMobiles].filter(([, who]) => who.length > 1);
  for (const [number, who] of shared) {
    for (const member of who) {
      member.mobile = null;
      member.provenance.mobile = undefined;
    }
    mobileNotes.push(
      `"${number}" dropped from ${who.length} members who cannot all have it: ` +
        who.map((m) => `${m.lastName} ${m.firstName}`).join(", "),
    );
  }

  if (overrideNotes.length > 0) {
    step(`Overridden by hand — ${overrideNotes.length}`);
    info(
      `from data/${OVERRIDES_FILE}. The sources still say what they said — an ` +
        "override moves Backstage only.",
    );
    for (const note of overrideNotes) info(`  ${note}`);
  }

  if (estimatedArchivals > 0) {
    step(`Archival dates estimated — ${estimatedArchivals}`);
    info(
      "nothing recorded when these members left, so the date comes from how long " +
        "their rung usually lasts; provenance and the audit diff both say so",
    );
    for (const status of MEMBERSHIP_STATUSES) {
      const count = members.filter(
        (m) => m.archivedAtEstimated && m.status === status,
      ).length;
      if (count > 0) {
        info(
          `${String(count).padStart(4)}  ${status} — joined + ${YEARS_BEFORE_LEAVING[status]} year(s)`,
        );
      }
    }
  }

  if (mobileNotes.length > 0) {
    step(`Mobile numbers — ${mobileNotes.length}`);
    for (const note of mobileNotes) info(`  ${note}`);
  }

  if (droppedRoles.length > 0) {
    step(`Leadership roles dropped — ${droppedRoles.length}`);
    info(
      "the member is archived, so the role has ended; only current ones are rows",
    );
    for (const line of droppedRoles) info(`  ${line}`);
  }

  if (rewritten.length > 0) {
    step("Ids rewritten since the last run");
    info(
      "Harmless before the cutover; after it these need an UPDATE in place.",
    );
    for (const line of rewritten) info(`  ${line}`);
  }

  // ── Files ─────────────────────────────────────────────────────────────────

  const ignoredWhy = new Map(
    ignoredEntries.map(({ entry, why }) => [entry, why]),
  );
  const toRow = (entry: RejectedCluster): TsvRow => {
    const previous = findDecision(decisions, entry.records);
    return {
      name: entry.name,
      // `join` gives "" for an ignored or skipped row, never null, so `??` here
      // would never reach the fallback.
      reasons: entry.reasons.join("; ") || ignoredWhy.get(entry) || "skipped",
      detail: entry.detail,
      suggestedJoined: entry.suggestedJoined,
      basis: entry.basis,
      setStatus: previous?.setStatus ?? "",
      setJoined: previous?.setJoined ?? "",
      decision: previous?.decision ?? "",
      records: entry.records.join(" | "),
    };
  };
  // Skipped rows stay in the file, or the next run forgets they were decided.
  const rejectedRows: TsvRow[] = [
    ...rejected,
    ...skipped,
    ...ignoredEntries.map(({ entry }) => entry),
  ].map(toRow);

  info(await writeJson("members.json", members));
  info(
    await writeText(
      REJECTED_FILE,
      formatTsv(rejectedRows, [
        "name",
        "reasons",
        "detail",
        "suggestedJoined",
        "basis",
        "setStatus",
        "setJoined",
        "decision",
        "records",
      ]),
    ),
  );
  info(await saveIdAssignments(assignments));

  if (rejected.length > 0 && !allowUnresolved) {
    fail(
      `${rejected.length} clusters could not be built into a member.\n` +
        `  Answer them in data/${REJECTED_FILE}, fix them at the source, or pass\n` +
        "  --allow-unresolved to continue without them. Listed either way.",
    );
  }

  done(`${members.length} members ready for import.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
