import "dotenv/config";
import { authentikRequest } from "../lib/authentik/client";
import prisma from "../lib/prisma";
import { done, fail, hasFlag, info, step } from "../scripts/utils";
import { hasAuthentikAccount, MEMBERSHIP_STATUSES } from "../types";

/**
 * Checks the imported database against the things that would break quietly.
 *
 * Everything here is a property of the data as written, not of the pipeline that
 * wrote it — this runs against Postgres and Authentik, so it would still catch a
 * bad import produced some other way.
 */

interface Check {
  name: string;
  failures: string[];
  /** Reported but not fatal. */
  warning?: boolean;
}

interface AuthentikUser {
  uuid: string;
  username: string;
  is_active: boolean;
}

interface Paginated<T> {
  results: T[];
  pagination: { total_pages: number };
}

async function authentikUuids(): Promise<Set<string>> {
  const uuids = new Set<string>();
  for (let page = 1; ; page++) {
    const data = await authentikRequest<Paginated<AuthentikUser>>(
      `/core/users/?page=${page}&page_size=200`,
    );
    for (const user of data.results) uuids.add(user.uuid);
    if (page >= data.pagination.total_pages) break;
  }
  return uuids;
}

async function main(): Promise<number> {
  const offline = hasFlag("--offline");
  const members = await prisma.member.findMany({
    include: { leadershipRole: true },
  });
  if (members.length === 0) {
    await prisma.$disconnect();
    fail("No members in the database. Run migration/import.ts first.");
  }

  const checks: Check[] = [];
  const add = (name: string, failures: string[], warning = false): void => {
    checks.push({ name, failures, warning });
  };

  const label = (m: {
    lastName: string;
    firstName: string;
    id: string;
  }): string => `${m.lastName} ${m.firstName} (${m.id})`;

  step(`Verifying ${members.length} members`);

  // Drupal is on its way out but has not gone, and an edit to a member without a
  // link lands as a FAILED job. Nobody edits an archived member, so those are
  // only reported.
  add(
    "every unarchived member has a websiteUserId",
    members.filter((m) => !m.archived && !m.websiteUserId).map((m) => label(m)),
  );
  add(
    "archived members have a websiteUserId",
    members.filter((m) => m.archived && !m.websiteUserId).map((m) => label(m)),
    true,
  );

  // No longer a warning: every archival is dated, from a sheet tab or from how
  // long that rung usually lasts.
  add(
    "archived members carry an archivedAt",
    members.filter((m) => m.archived && !m.archivedAt).map((m) => label(m)),
  );
  // Against the day the semester began, not 1 January of its first year — the
  // looser form passes an archival eight months before an autumn joining.
  const joinedOn = (semester: string): Date => {
    const [startYear, endYear, number] = semester.split("/").map(Number);
    return number === 1
      ? new Date(Date.UTC(startYear, 8, 1))
      : new Date(Date.UTC(endYear, 1, 1));
  };
  add(
    "no archival predates the joining",
    members
      .filter((m) => m.archivedAt && m.archivedAt < joinedOn(m.joinedSemester))
      .map(
        (m) =>
          `${label(m)} joined ${m.joinedSemester}, archived ${m.archivedAt?.toISOString().slice(0, 10)}`,
      ),
  );
  add(
    "no archival is in the future",
    members
      .filter((m) => m.archivedAt && m.archivedAt > new Date())
      .map((m) => `${label(m)} ${m.archivedAt?.toISOString().slice(0, 10)}`),
  );
  add(
    "unarchived members carry no archivedAt",
    members.filter((m) => !m.archived && m.archivedAt).map((m) => label(m)),
  );

  add(
    "joinedSemester is well formed",
    members
      .filter((m) => !/^\d{4}\/\d{4}\/[12]$/.test(m.joinedSemester))
      .map((m) => `${label(m)} "${m.joinedSemester}"`),
  );
  add(
    "status is a known value",
    members
      .filter(
        (m) => !(MEMBERSHIP_STATUSES as readonly string[]).includes(m.status),
      )
      .map((m) => `${label(m)} ${m.status}`),
  );

  // A LeadershipRole row is by definition a current role; one that ended is a
  // TimelineEntry instead.
  add(
    "no archived member holds a leadership role",
    members
      .filter((m) => m.archived && m.leadershipRole)
      .map((m) => `${label(m)} "${m.leadershipRole?.label}"`),
  );

  const registered = new Set(
    (await prisma.authentikGroup.findMany()).map((g) => g.authentikGroupId),
  );
  add(
    "every role group is in the AuthentikGroup registry",
    members
      .flatMap((m) =>
        (m.leadershipRole?.authentikGroupIds ?? []).map((id) => ({ m, id })),
      )
      .filter(({ id }) => !registered.has(id))
      .map(({ m, id }) => `${label(m)} → ${id}`),
    registered.size === 0,
  );

  // The Drupal field was mandatory, so anyone unwilling to give a number typed
  // something. Whatever survived here reaches Authentik as a real contact.
  add(
    "mobile numbers are in international form",
    members
      .filter((m) => m.mobile && !/^\+[1-9]\d{9,14}$/.test(m.mobile))
      .map((m) => `${label(m)} "${m.mobile}"`),
  );

  // A role that grants a permission group would revoke it when the role ends:
  // removing "Műszaki vezető" would call REMOVE_FROM_GROUP on Admin.
  const permissionGroups = await prisma.authentikGroup.findMany({
    where: {
      displayName: {
        in: [
          process.env.AUTHENTIK_GROUP_ADMIN ?? "",
          process.env.AUTHENTIK_GROUP_LEADERSHIP ?? "",
          process.env.AUTHENTIK_GROUP_API_CLIENTS ?? "",
        ],
      },
    },
  });
  const reserved = new Set([
    ...permissionGroups.map((group) => group.authentikGroupId),
    process.env.AUTHENTIK_GROUP_LEADERSHIP_UUID ?? "",
  ]);
  add(
    "no leadership role grants a permission group",
    members
      .flatMap((m) =>
        (m.leadershipRole?.authentikGroupIds ?? []).map((id) => ({ m, id })),
      )
      .filter(({ id }) => reserved.has(id))
      .map(({ m, id }) => `${label(m)} → ${id}`),
  );

  // The import writes none, and one appearing here means it went through the
  // service layer, which would also have called Authentik and Drupal.
  add(
    "no sync jobs were written",
    (await prisma.syncJob.count()) === 0 ? [] : ["sync jobs exist"],
  );

  // ── The id shape, both directions ─────────────────────────────────────────

  if (offline) {
    info("--offline: skipping the Authentik checks");
  } else {
    const uuids = await authentikUuids();
    info(`${uuids.size} users in Authentik`);

    add(
      "every Authentik-shaped id resolves to a real user",
      members
        .filter((m) => hasAuthentikAccount(m.id) && !uuids.has(m.id))
        .map((m) => label(m)),
    );
    // The quiet direction: a member who does have an account but carries a local
    // id has every Authentik job recorded SKIPPED, so their sync stops without a
    // single failure to look at.
    add(
      "no local id belongs to someone who has an account",
      members
        .filter((m) => !hasAuthentikAccount(m.id) && uuids.has(m.id))
        .map((m) => label(m)),
    );
  }

  // ── Report ────────────────────────────────────────────────────────────────

  let failed = 0;
  for (const check of checks) {
    if (check.failures.length === 0) {
      info(`  ok    ${check.name}`);
      continue;
    }
    const marker = check.warning ? "warn " : "FAIL ";
    if (!check.warning) failed++;
    info(`  ${marker} ${check.name} — ${check.failures.length}`);
    for (const failure of check.failures.slice(0, 10))
      info(`          ${failure}`);
    if (check.failures.length > 10) {
      info(`          … and ${check.failures.length - 10} more`);
    }
  }

  step("Counts");
  for (const status of MEMBERSHIP_STATUSES) {
    info(
      `${String(members.filter((m) => m.status === status).length).padStart(4)}  ${status}`,
    );
  }
  info(`${members.filter((m) => m.archived).length} archived`);
  info(
    `${members.filter((m) => hasAuthentikAccount(m.id)).length} with an Authentik account`,
  );
  info(`${await prisma.timelineEntry.count()} timeline entries`);
  info(`${await prisma.auditLog.count()} audit log entries`);

  return failed;
}

// `fail` exits the process, and doing that with Prisma's connection still open
// trips a libuv teardown assertion on Windows. Disconnect first, then report.
main()
  .then(async (failed) => {
    await prisma.$disconnect();
    if (failed === 0) {
      done("Verified.");
      return;
    }
    // Not `fail`: it calls process.exit, and exiting while the Authentik fetch
    // still holds a socket trips a libuv teardown assertion on Windows. Setting
    // the code lets the process wind down on its own.
    console.error(`
✖ ${failed} checks failed.
`);
    process.exitCode = 1;
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
