import "dotenv/config";
import { createHash } from "node:crypto";
import type { MembershipStatus, Prisma } from "../app/generated/prisma/client";
import prisma from "../lib/prisma";
import {
  currentSemester,
  deriveUsername,
  MEMBERSHIP_STATUSES,
  parseSemester,
} from "../types";
import { type ResolvedGroups, resolveAuthentikGroups } from "./dev-groups";
import { type DevUser, resolveDevUser } from "./dev-user";
import { SEED_MEMBERS, type SeedMember } from "./seed-data";
import { assertLocalDatabase, done, hasFlag, info, step } from "./utils";

const NOW = new Date();
const DEV_USER_JOINED_SEMESTERS_AGO = 6;

interface BuiltMember {
  row: Prisma.MemberCreateManyInput;
  joinedAt: Date;
  archivedAt: Date | null;
  role?: { label: string; authentikGroupIds: string[] };
}

async function seedDev(): Promise<void> {
  assertLocalDatabase(hasFlag("--force"));
  const devUser = await resolveDevUser(hasFlag("--reset-user"));
  const groups = await resolveAuthentikGroups();

  const members = [
    buildDevMember(devUser),
    ...SEED_MEMBERS.map((seed, index) => buildMember(seed, index + 1, groups)),
  ];

  step("Wiping existing data");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.timelineEntry.deleteMany(),
    prisma.syncJob.deleteMany(),
    prisma.googleGroupEntry.deleteMany(),
    prisma.leadershipRole.deleteMany(),
    prisma.member.deleteMany(),
    prisma.authentikGroup.deleteMany(),
  ]);

  step("Seeding");
  await prisma.authentikGroup.createMany({ data: groups.rows });
  await prisma.member.createMany({ data: members.map((m) => m.row) });
  await prisma.leadershipRole.createMany({ data: buildRoles(members) });
  await prisma.timelineEntry.createMany({ data: buildTimeline(members) });
  await prisma.auditLog.createMany({ data: buildAuditLog(members, devUser) });
  await prisma.syncJob.createMany({ data: buildSyncJobs(members, devUser) });

  info(`${members.length} members, ${groups.rows.length} groups`);
  info(`you: ${devUser.lastName} ${devUser.firstName} <${devUser.email}>`);
  done("Dev database seeded.");
}

// ─── Row builders ─────────────────────────────────────────────────────────────

function buildMember(
  seed: SeedMember,
  index: number,
  groups: ResolvedGroups,
): BuiltMember {
  const joinedSemester = shiftSemester(
    currentSemester(),
    seed.joinedSemestersAgo,
  );
  const joinedAt = semesterStart(joinedSemester);
  const archivedAt =
    seed.archivedSemestersAgo === undefined
      ? null
      : semesterStart(
          shiftSemester(currentSemester(), seed.archivedSemestersAgo),
        );
  const email = emailFor(seed.firstName, seed.lastName);

  return {
    joinedAt,
    archivedAt,
    role: seed.role && {
      label: seed.role.label,
      authentikGroupIds: seed.role.groups.map(groups.idFor),
    },
    row: {
      id: stableId(email),
      firstName: seed.firstName,
      lastName: seed.lastName,
      nickname: seed.nickname,
      email,
      mobile:
        seed.status === "ALUMNI" || archivedAt
          ? null
          : `+3630${1234000 + index}`,
      university: seed.university,
      major: seed.major,
      dormRoom: seed.dormRoom,
      status: seed.status,
      joinedSemester,
      // Only some members are linked to the legacy website — the gap is what makes a
      // FAILED website job realistic to reproduce locally.
      websiteUserId: index % 3 === 0 ? String(1200 + index) : null,
      archived: archivedAt !== null,
      archivedAt,
      createdAt: joinedAt,
      updatedAt: NOW,
    },
  };
}

function buildDevMember(devUser: DevUser): BuiltMember {
  const joinedSemester = shiftSemester(
    currentSemester(),
    DEV_USER_JOINED_SEMESTERS_AGO,
  );
  const joinedAt = semesterStart(joinedSemester);

  return {
    joinedAt,
    archivedAt: null,
    row: {
      id: devUser.id,
      firstName: devUser.firstName,
      lastName: devUser.lastName,
      nickname: devUser.nickname,
      email: devUser.email,
      mobile: "+36301234000",
      university: null,
      major: null,
      dormRoom: null,
      status: devUser.status,
      joinedSemester,
      websiteUserId: null,
      archived: false,
      archivedAt: null,
      createdAt: joinedAt,
      updatedAt: NOW,
    },
  };
}

function buildRoles(
  members: BuiltMember[],
): Prisma.LeadershipRoleCreateManyInput[] {
  return members.flatMap(({ row, role }) =>
    role
      ? [
          {
            memberId: row.id,
            label: role.label,
            authentikGroupIds: role.authentikGroupIds,
          },
        ]
      : [],
  );
}

function buildTimeline(
  members: BuiltMember[],
): Prisma.TimelineEntryCreateManyInput[] {
  return members.flatMap(({ row, joinedAt, archivedAt, role }) => {
    const ladder = statusLadder(row.status as MembershipStatus);
    const dates = stepDates(joinedAt, archivedAt ?? NOW, ladder.length);

    const entries: Prisma.TimelineEntryCreateManyInput[] = ladder.map(
      (status, i) => ({
        memberId: row.id,
        action: i === 0 ? "MEMBER_CREATED" : "STATUS_CHANGED",
        status,
        createdAt: dates[i],
      }),
    );

    if (role) {
      entries.push({
        memberId: row.id,
        action: "ROLE_ASSIGNED",
        roleLabel: role.label,
        createdAt: dates[dates.length - 1],
      });
    }
    if (archivedAt) {
      entries.push({
        memberId: row.id,
        action: "MEMBER_ARCHIVED",
        createdAt: archivedAt,
      });
    }
    return entries;
  });
}

function buildAuditLog(
  members: BuiltMember[],
  devUser: DevUser,
): Prisma.AuditLogCreateManyInput[] {
  return members.flatMap(({ row, joinedAt, archivedAt, role }) => {
    // Nobody created the dev user — they are the actor everywhere else.
    const actorId = row.id === devUser.id ? null : devUser.id;
    const ladder = statusLadder(row.status as MembershipStatus);
    const dates = stepDates(joinedAt, archivedAt ?? NOW, ladder.length);

    const entries: Prisma.AuditLogCreateManyInput[] = ladder.map((status, i) =>
      i === 0
        ? {
            actorId,
            targetId: row.id,
            action: "MEMBER_CREATED",
            diff: {
              created: {
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
              },
            },
            createdAt: dates[i],
          }
        : {
            actorId,
            targetId: row.id,
            action: "STATUS_CHANGED",
            diff: { status: { old: ladder[i - 1], new: status } },
            createdAt: dates[i],
          },
    );

    if (role) {
      entries.push({
        actorId,
        targetId: row.id,
        action: "ROLE_ASSIGNED",
        diff: {
          label: { old: null, new: role.label },
          authentikGroupIds: { old: null, new: role.authentikGroupIds },
        },
        createdAt: dates[dates.length - 1],
      });
    }
    if (archivedAt) {
      entries.push({
        actorId,
        targetId: row.id,
        action: "MEMBER_ARCHIVED",
        diff: { archived: { old: false, new: true } },
        createdAt: archivedAt,
      });
    }
    return entries;
  });
}

function buildSyncJobs(
  members: BuiltMember[],
  devUser: DevUser,
): Prisma.SyncJobCreateManyInput[] {
  const jobs = members.flatMap(({ row, joinedAt }) => {
    const username = deriveUsername(row.firstName, row.lastName);
    const created: Prisma.SyncJobCreateManyInput[] = [
      {
        target: "AUTHENTIK",
        operation: "CREATE_USER",
        memberId: row.id,
        payload: {
          username,
          name: `${row.firstName} ${row.lastName}`,
          email: row.email,
        },
        status: "SUCCESS",
        attempts: 1,
        result: { pk: 100 + jobIndex(row.id), uuid: row.id, username },
        createdAt: joinedAt,
        updatedAt: joinedAt,
      },
    ];

    if (row.websiteUserId) {
      created.push({
        target: "WEBSITE",
        operation: "CREATE_USER",
        memberId: row.id,
        payload: {
          username,
          fullname: `${row.lastName} ${row.firstName}`,
          nickname: row.nickname,
          email: row.email,
          joinYear: parseSemester(row.joinedSemester).startYear,
        },
        status: "SUCCESS",
        attempts: 1,
        result: { uid: row.websiteUserId },
        createdAt: joinedAt,
        updatedAt: joinedAt,
      });
    }
    return created;
  });

  return [...jobs, ...buildFailedSyncJobs(members, devUser)];
}

// Two failures so /admin/sync-jobs and its retry button have something to show.
function buildFailedSyncJobs(
  members: BuiltMember[],
  devUser: DevUser,
): Prisma.SyncJobCreateManyInput[] {
  // Never the dev user, whose status is whatever they answered at the prompt — it would
  // decide which member gets the failure.
  const active = members.filter(
    (m) =>
      m.row.id !== devUser.id && !m.archivedAt && m.row.status === "MEMBER",
  );
  const unlinked = active.find((m) => !m.row.websiteUserId);
  const linked = active.find((m) => m.row.websiteUserId);
  const failedAt = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);

  const jobs: Prisma.SyncJobCreateManyInput[] = [];
  if (linked) {
    jobs.push({
      target: "AUTHENTIK",
      operation: "UPDATE_USER",
      memberId: linked.row.id,
      payload: {
        attributes: {
          first_name: linked.row.firstName,
          last_name: linked.row.lastName,
          mobile: linked.row.mobile,
        },
      },
      status: "FAILED",
      attempts: 2,
      result: { error: "Authentik API 404: user not found" },
      createdAt: failedAt,
      updatedAt: failedAt,
    });
  }
  if (unlinked) {
    jobs.push({
      target: "WEBSITE",
      operation: "UPDATE_USER",
      memberId: unlinked.row.id,
      payload: {
        fullname: `${unlinked.row.lastName} ${unlinked.row.firstName}`,
        email: unlinked.row.email,
      },
      status: "FAILED",
      attempts: 1,
      result: {
        error: "Member has no websiteUserId — cannot target the account",
      },
      createdAt: failedAt,
      updatedAt: failedAt,
    });
  }
  return jobs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusLadder(status: MembershipStatus): MembershipStatus[] {
  return MEMBERSHIP_STATUSES.slice(0, MEMBERSHIP_STATUSES.indexOf(status) + 1);
}

function shiftSemester(semester: string, back: number): string {
  let { startYear, number } = parseSemester(semester);
  for (let i = 0; i < back; i++) {
    if (number === 2) {
      number = 1;
    } else {
      number = 2;
      startYear -= 1;
    }
  }
  return `${startYear}/${startYear + 1}/${number}`;
}

function semesterStart(semester: string): Date {
  const { startYear, endYear, number } = parseSemester(semester);
  return number === 1
    ? new Date(Date.UTC(startYear, 8, 1))
    : new Date(Date.UTC(endYear, 1, 1));
}

// `to` is the archival date for archived members, not NOW — otherwise their ladder runs past
// the archival entry and the timeline shows a promotion after the member was archived.
function stepDates(from: Date, to: Date, count: number): Date[] {
  const span = to.getTime() - from.getTime();
  return Array.from(
    { length: count },
    (_, i) => new Date(from.getTime() + (span * i) / Math.max(count, 1)),
  );
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function emailFor(firstName: string, lastName: string): string {
  return `${normalizeName(lastName)}.${normalizeName(firstName)}@example.com`;
}

/** Stable ids keep member URLs valid across reseeds. */
function stableId(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function jobIndex(id: string): number {
  return Number.parseInt(id.slice(0, 4), 16) % 900;
}

seedDev()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
