import { z } from "zod";
import type {
  GoogleGroupMatchStatus,
  PrismaClient,
} from "@/app/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  getServiceAccountEmail,
  isGoogleGroupConfigured,
} from "@/lib/google/client";
import { listGroupMembers } from "@/lib/google/groups";
import {
  type Actor,
  ensureCanAdminister,
  ensureCanViewAdminArea,
} from "@/lib/permissions";
import { NO_GOOGLE_GROUP_CONFIG_REASON } from "@/lib/sync-jobs";
import { AnnotateEntrySchema } from "./google-group-schemas";

export { AnnotateEntrySchema } from "./google-group-schemas";

function matchStatusFor(member: { archived: boolean }): GoogleGroupMatchStatus {
  return member.archived ? "ARCHIVED_ON_LIST" : "MATCHED";
}

export async function refreshGoogleGroupEntries(
  prisma: PrismaClient,
  actor: Actor,
) {
  ensureCanAdminister(actor);
  if (!isGoogleGroupConfigured()) {
    throw new ValidationError({ config: NO_GOOGLE_GROUP_CONFIG_REASON });
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
  ensureCanViewAdminArea(actor);

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
  ensureCanAdminister(actor);

  const parsed = AnnotateEntrySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const entry = await prisma.googleGroupEntry.findUnique({ where: { email } });
  if (!entry) throw new NotFoundError();

  const isSecondary = parsed.data.matchStatus === "SECONDARY_EMAIL";
  const memberId = isSecondary ? parsed.data.memberId : null;

  // The picker only offers real members, so a missing one means a hand-built request. The
  // foreign key would catch it either way, but as an error nothing maps — a 500 instead of
  // a rejected field.
  if (memberId && !(await prisma.member.count({ where: { id: memberId } }))) {
    throw new ValidationError({ memberId: "Nincs ilyen tag" });
  }

  return prisma.googleGroupEntry.update({
    where: { email },
    data: {
      matchStatus: parsed.data.matchStatus,
      memberId,
      note: parsed.data.note || null,
    },
  });
}
