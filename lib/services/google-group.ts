import { z } from "zod";
import type {
  GoogleGroupMatchStatus,
  PrismaClient,
} from "@/app/generated/prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  getServiceAccountEmail,
  isGoogleGroupConfigured,
} from "@/lib/google/client";
import { listGroupMembers } from "@/lib/google/groups";
import { AnnotateEntrySchema } from "./google-group-schemas";
import type { Actor } from "./members";

export { AnnotateEntrySchema } from "./google-group-schemas";

function ensureAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError();
}

function ensureLeaderOrAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN" && actor.role !== "LEADER") {
    throw new ForbiddenError();
  }
}

function matchStatusFor(member: { archived: boolean }): GoogleGroupMatchStatus {
  return member.archived ? "ARCHIVED_ON_LIST" : "MATCHED";
}

export async function refreshGoogleGroupEntries(
  prisma: PrismaClient,
  actor: Actor,
) {
  ensureAdmin(actor);
  if (!isGoogleGroupConfigured()) {
    throw new ValidationError({ config: "Nincs Google Group beállítva" });
  }

  const serviceAccount = getServiceAccountEmail().toLowerCase();
  const addresses = (await listGroupMembers())
    .map((entry) => entry.email)
    .filter((email) => email !== serviceAccount);

  // Every member is read to match case-insensitively; at studio scale that is one small
  // query, and Prisma cannot combine `in` with insensitive mode.
  const members = await prisma.member.findMany();
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));

  const existing = await prisma.googleGroupEntry.findMany();
  const annotatedByEmail = new Map(
    existing
      .filter(
        (entry) =>
          entry.matchStatus === "SECONDARY_EMAIL" ||
          entry.matchStatus === "KNOWN_ADDRESS",
      )
      .map((entry) => [entry.email, entry]),
  );

  const rows = addresses.map((email) => {
    // The states a human set survive a refresh; matching cannot derive either of them.
    const annotated = annotatedByEmail.get(email);
    if (annotated) return annotated;

    const member = byEmail.get(email);
    return {
      email,
      matchStatus: member ? matchStatusFor(member) : ("UNKNOWN" as const),
      memberId: member?.id ?? null,
      note: existing.find((entry) => entry.email === email)?.note ?? null,
    };
  });

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "GOOGLE_GROUP_SYNCED",
        diff: { addresses: { old: existing.length, new: rows.length } },
      },
    }),
    prisma.googleGroupEntry.deleteMany({
      where: { email: { notIn: addresses } },
    }),
    ...rows.map((row) =>
      prisma.googleGroupEntry.upsert({
        where: { email: row.email },
        create: row,
        update: {
          matchStatus: row.matchStatus,
          memberId: row.memberId,
          note: row.note,
        },
      }),
    ),
  ]);

  return { count: rows.length };
}

export async function getGoogleGroupReconciliation(
  prisma: PrismaClient,
  actor: Actor,
) {
  ensureLeaderOrAdmin(actor);

  const [entries, allMembers, lastSync] = await Promise.all([
    prisma.googleGroupEntry.findMany({
      include: { member: true },
      orderBy: { email: "asc" },
    }),
    prisma.member.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    // The audit entry doubles as the timestamp; nothing else records when a read happened.
    prisma.auditLog.findFirst({
      where: { action: "GOOGLE_GROUP_SYNCED" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const onList = new Set(entries.map((entry) => entry.memberId));

  // Archived members stay in `members`: an unrecognised address may well be theirs.
  return {
    entries,
    missing: allMembers.filter((member) => !onList.has(member.id)),
    members: allMembers,
    lastSyncedAt: lastSync?.createdAt ?? null,
  };
}

export async function annotateGoogleGroupEntry(
  prisma: PrismaClient,
  email: string,
  input: unknown,
  actor: Actor,
) {
  ensureAdmin(actor);

  const parsed = AnnotateEntrySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const entry = await prisma.googleGroupEntry.findUnique({ where: { email } });
  if (!entry) throw new NotFoundError();

  const isSecondary = parsed.data.matchStatus === "SECONDARY_EMAIL";
  return prisma.googleGroupEntry.update({
    where: { email },
    data: {
      matchStatus: parsed.data.matchStatus,
      memberId: isSecondary ? parsed.data.memberId : null,
      note: parsed.data.note || null,
    },
  });
}
