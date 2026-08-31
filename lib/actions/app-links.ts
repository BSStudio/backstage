"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  FORBIDDEN,
  mapActionError,
} from "@/lib/actions/result";
import { canAdminister } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import {
  createAppLink,
  deleteAppLink,
  moveAppLink,
  updateAppLink,
} from "@/lib/services/app-links";
import { permittedActor } from "@/lib/session";

const INVALID = { validation: "Érvénytelen alkalmazásadatok" };

// The dashboard shows the featured ones, so every mutation can change what it renders.
function revalidateAppLinks() {
  revalidatePath("/admin/apps");
  revalidatePath("/apps");
  revalidatePath("/");
}

export async function createAppLinkAction(
  input: Record<string, unknown>,
): Promise<ActionResult<{ id: string; name: string }>> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    const link = await createAppLink(prisma, input, actor);
    revalidateAppLinks();
    return { success: true, data: { id: link.id, name: link.name } };
  } catch (error) {
    return mapActionError(error, INVALID);
  }
}

export async function updateAppLinkAction(
  id: string,
  input: Record<string, unknown>,
): Promise<ActionResult<{ id: string; name: string }>> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    const link = await updateAppLink(prisma, id, input, actor);
    revalidateAppLinks();
    return { success: true, data: { id: link.id, name: link.name } };
  } catch (error) {
    return mapActionError(error, INVALID);
  }
}

export async function deleteAppLinkAction(
  id: string,
): Promise<ActionResult<null>> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    await deleteAppLink(prisma, id, actor);
    revalidateAppLinks();
    return { success: true, data: null };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function moveAppLinkAction(
  id: string,
  direction: "UP" | "DOWN",
): Promise<ActionResult<{ moved: boolean }>> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    const result = await moveAppLink(prisma, id, direction, actor);
    revalidateAppLinks();
    return { success: true, data: result };
  } catch (error) {
    return mapActionError(error);
  }
}
