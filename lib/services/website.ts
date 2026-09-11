import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { ValidationError } from "@/lib/errors";
import { type Actor, ensureCanAdminister } from "@/lib/permissions";
import { buildWebsiteMember } from "@/lib/sync/website/payload";
import { isWebsiteWebhookConfigured, pushMembers } from "@/lib/website/webhook";

export async function forceWebsiteFullSync(prisma: PrismaClient, actor: Actor) {
  ensureCanAdminister(actor);
  if (!isWebsiteWebhookConfigured()) {
    throw new ValidationError({
      config: "A honlap szinkronizálása nincs beállítva.",
    });
  }

  // Only active members go over, because replace mode archives whatever the list leaves
  // out. That is how an archived member is dropped — and why anyone the website holds that
  // Backstage has never known about goes with them.
  const members = await prisma.member.findMany({
    where: { archived: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      avatarUrl: true,
      status: true,
      joinedSemester: true,
      leadershipRole: { select: { id: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // A fresh delivery id per click rather than one an admin could replay: a replace of an
  // unchanged list is a no-op on the other side, so a second click wanting to re-push
  // should re-push.
  const response = await pushMembers(
    { mode: "replace", members: members.map(buildWebsiteMember) },
    randomUUID(),
  );

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "WEBSITE_FULL_SYNC",
      targetLabel: "Honlap",
      diff: {
        members: members.length,
        result: response.result ?? null,
      } as object,
    },
  });

  return { count: members.length, result: response.result ?? null };
}
