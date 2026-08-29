"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  FORBIDDEN,
  mapActionError,
} from "@/lib/actions/result";
import { GoogleApiError } from "@/lib/google/client";
import { captureServiceError } from "@/lib/observability/capture";
import { canAdminister } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import {
  annotateGoogleGroupEntry,
  refreshGoogleGroupEntries,
} from "@/lib/services/google-group";
import { permittedActor } from "@/lib/session";

// A Google failure is the one error worth showing verbatim: it names what the API refused,
// which is what an admin needs before touching the group by hand.
function mapError(error: unknown): ActionResult<never> {
  if (error instanceof GoogleApiError) {
    captureServiceError(error);
    return { success: false, error: error.message };
  }
  return mapActionError(error);
}

export async function refreshGoogleGroupAction(): Promise<
  ActionResult<{ count: number }>
> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    const { count } = await refreshGoogleGroupEntries(prisma, actor);
    revalidatePath("/admin/google-group");
    return { success: true, data: { count } };
  } catch (error) {
    return mapError(error);
  }
}

export async function annotateGoogleGroupEntryAction(
  email: string,
  input: Record<string, unknown>,
): Promise<ActionResult<{ email: string }>> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    const entry = await annotateGoogleGroupEntry(prisma, email, input, actor);
    revalidatePath("/admin/google-group");
    return { success: true, data: { email: entry.email } };
  } catch (error) {
    return mapError(error);
  }
}
