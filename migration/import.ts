import "dotenv/config";
import type { Prisma } from "../app/generated/prisma/client";
import prisma from "../lib/prisma";
import {
  assertLocalDatabase,
  done,
  fail,
  hasFlag,
  info,
  step,
} from "../scripts/utils";
import { parseSemester } from "../types";
import type { BuiltMember } from "./build-members";
import { readJsonIfExists } from "./lib/paths";

/**
 * Writes the built members into the local database.
 *
 * Everything goes through raw Prisma. `createMember` would call Authentik and
 * Drupal for every row; the whole point of this migration is that it must not —
 * the accounts already exist and the import is only teaching Backstage about
 * them. No `SyncJob` rows are produced either, not even `SKIPPED` ones: SKIPPED
 * records a call the app declined to make, and the import makes none.
 *
 * Production is not written to directly. This builds a local database that is
 * moved across as a `pg_dump`, so it refuses a non-local `DATABASE_URL`.
 */

const IMPORTED_TABLES = [
  "auditLog",
  "timelineEntry",
  "syncJob",
  "googleGroupEntry",
  "leadershipRole",
  "member",
] as const;

/**
 * The day a semester starts, so a member's first timeline entry sits where their
 * membership actually began rather than all 369 landing on the import date.
 */
function semesterStart(semester: string): Date {
  const { startYear, endYear, number } = parseSemester(semester);
  return number === 1
    ? new Date(Date.UTC(startYear, 8, 1))
    : new Date(Date.UTC(endYear, 1, 1));
}

function memberRow(member: BuiltMember): Prisma.MemberCreateManyInput {
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    nickname: member.nickname,
    email: member.email,
    mobile: member.mobile,
    university: member.university,
    major: member.major,
    dormRoom: member.dormRoom,
    status: member.status,
    joinedSemester: member.joinedSemester,
    websiteUserId: member.websiteUserId,
    archived: member.archived,
    archivedAt: member.archivedAt ? new Date(member.archivedAt) : null,
  };
}

function timelineRows(
  member: BuiltMember,
): Prisma.TimelineEntryCreateManyInput[] {
  const rows: Prisma.TimelineEntryCreateManyInput[] = [
    {
      memberId: member.id,
      action: "MEMBER_CREATED",
      status: member.status,
      createdAt: semesterStart(member.joinedSemester),
    },
  ];

  // Only when the date is actually known. The Sheet dates an archival to the
  // year of its tab and nothing dates the rest, and an invented timestamp reads
  // exactly like a recorded one.
  if (member.archived && member.archivedAt) {
    rows.push({
      memberId: member.id,
      action: "MEMBER_ARCHIVED",
      createdAt: new Date(member.archivedAt),
    });
  }
  return rows;
}

function auditRow(member: BuiltMember): Prisma.AuditLogCreateManyInput {
  return {
    // No actor: this was not done by a member, and a fabricated one would be a
    // lie in the one table that exists to say who did what.
    actorId: null,
    targetId: member.id,
    action: "MEMBER_CREATED",
    diff: {
      imported: true,
      sources: member.records,
      provenance: member.provenance,
    } as Prisma.InputJsonValue,
  };
}

async function main(): Promise<void> {
  const dryRun = hasFlag("--dry-run");
  assertLocalDatabase(hasFlag("--force"));

  const members = await readJsonIfExists<BuiltMember[]>("members.json");
  if (!members) {
    fail("No data/members.json. Run migration/build-members.ts first.");
  }
  if (members.length === 0) fail("data/members.json is empty.");

  const memberRows = members.map(memberRow);
  const roleRows: Prisma.LeadershipRoleCreateManyInput[] = members
    .filter((member) => member.role)
    .map((member) => ({
      memberId: member.id,
      label: (member.role as { label: string }).label,
      authentikGroupIds: (member.role as { authentikGroupIds: string[] })
        .authentikGroupIds,
    }));
  const timeline = members.flatMap(timelineRows);
  const audit = members.map(auditRow);

  step("To write");
  info(`${memberRows.length} members`);
  info(`${roleRows.length} leadership roles`);
  info(`${timeline.length} timeline entries`);
  info(`${audit.length} audit log entries`);
  info("0 sync jobs");

  const existing = await prisma.member.count();
  if (existing > 0) {
    info(`${existing} members already in the database — they will be replaced`);
  }

  if (dryRun) {
    step("Sample");
    for (const member of members.slice(0, 3)) {
      info(
        `${member.lastName} ${member.firstName} <${member.email}> ` +
          `${member.status}${member.archived ? " archived" : ""} ` +
          `joined ${member.joinedSemester} website ${member.websiteUserId ?? "-"}`,
      );
    }
    done("Dry run — nothing written.");
    return;
  }

  step("Writing");
  await prisma.$transaction([
    // Ordered so a foreign key never outlives what it points at.
    ...IMPORTED_TABLES.map((table) =>
      (
        prisma[table] as { deleteMany: () => Prisma.PrismaPromise<unknown> }
      ).deleteMany(),
    ),
    prisma.member.createMany({ data: memberRows }),
    prisma.leadershipRole.createMany({ data: roleRows }),
    prisma.timelineEntry.createMany({ data: timeline }),
    prisma.auditLog.createMany({ data: audit }),
  ]);

  info(`${await prisma.member.count()} members in the database`);
  done("Imported. Next: pnpm tsx migration/verify.ts");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
