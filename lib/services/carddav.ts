import { z } from "zod";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { hashCardDavToken, mintCardDavToken } from "@/lib/carddav/tokens";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { type Actor, ensureCanModifyMember } from "@/lib/permissions";
import { CreateCardDavTokenSchema } from "@/lib/services/carddav-schemas";

export type { CreateCardDavTokenInput } from "@/lib/services/carddav-schemas";
export { CreateCardDavTokenSchema } from "@/lib/services/carddav-schemas";

// Only the digest is stored, so the token itself exists nowhere but the answer that mints it.
export interface MintedCardDavToken {
  id: string;
  label: string;
  createdAt: Date;
  token: string;
}

export async function listCardDavTokens(
  prisma: PrismaClient,
  actor: Actor,
  memberId: string,
) {
  ensureCanModifyMember(actor, memberId);

  return prisma.cardDAVToken.findMany({
    where: { memberId },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

// Self-service only: a leader gets revocation, never a working credential.
export async function createCardDavToken(
  prisma: PrismaClient,
  actor: Actor,
  memberId: string,
  input: unknown,
): Promise<MintedCardDavToken> {
  if (actor.id !== memberId) throw new ForbiddenError();

  const parsed = CreateCardDavTokenSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.treeifyError(parsed.error));

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  });
  if (!member) throw new NotFoundError();

  const token = mintCardDavToken();

  const created = await prisma.$transaction(async (tx) => {
    const created = await tx.cardDAVToken.create({
      data: {
        memberId,
        label: parsed.data.label,
        tokenHash: hashCardDavToken(token),
      },
      select: { id: true, label: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: memberId,
        action: "CARDDAV_TOKEN_CREATED",
        diff: { label: { old: null, new: parsed.data.label } } as object,
      },
    });
    return created;
  });

  return { ...created, token };
}

export async function revokeCardDavToken(
  prisma: PrismaClient,
  actor: Actor,
  tokenId: string,
): Promise<void> {
  const token = await prisma.cardDAVToken.findUnique({
    where: { id: tokenId },
    select: { id: true, memberId: true, label: true },
  });
  if (!token) throw new NotFoundError();

  ensureCanModifyMember(actor, token.memberId);

  await prisma.$transaction([
    prisma.cardDAVToken.delete({ where: { id: token.id } }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        targetId: token.memberId,
        action: "CARDDAV_TOKEN_REVOKED",
        diff: { label: { old: token.label, new: null } } as object,
      },
    }),
  ]);
}
