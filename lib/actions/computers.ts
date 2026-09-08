"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  FORBIDDEN,
  mapActionError,
} from "@/lib/actions/result";
import { canAdminister } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { deleteComputer } from "@/lib/services/computers";
import { permittedActor } from "@/lib/session";

export async function deleteComputerAction(
  id: string,
): Promise<ActionResult<null>> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    await deleteComputer(prisma, id, actor);
    // The dashboard lists the same machines.
    revalidatePath("/computers");
    revalidatePath("/");
    return { success: true, data: null };
  } catch (error) {
    return mapActionError(error);
  }
}
