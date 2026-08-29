"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  mapActionError,
  UNAUTHORIZED,
} from "@/lib/actions/result";
import prisma from "@/lib/prisma";
import {
  createCardDavToken,
  type MintedCardDavToken,
  revokeCardDavToken,
} from "@/lib/services/carddav";
import { sessionActor } from "@/lib/session";

export async function createCardDavTokenAction(
  memberId: string,
  input: Record<string, unknown>,
): Promise<ActionResult<MintedCardDavToken>> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const token = await createCardDavToken(prisma, actor, memberId, input);
    revalidatePath(`/members/${memberId}`);
    return { success: true, data: token };
  } catch (error) {
    return mapActionError(error, { validation: "Érvénytelen eszköznév" });
  }
}

export async function revokeCardDavTokenAction(
  tokenId: string,
): Promise<ActionResult<null>> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const memberId = await revokeCardDavToken(prisma, actor, tokenId);
    revalidatePath(`/members/${memberId}`);
    return { success: true, data: null };
  } catch (error) {
    return mapActionError(error);
  }
}
