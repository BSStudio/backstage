"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  FORBIDDEN,
  mapActionError,
} from "@/lib/actions/result";
import { captureServiceError } from "@/lib/observability/capture";
import { canAdminister } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { forceWebsiteFullSync } from "@/lib/services/website";
import { permittedActor } from "@/lib/session";
import { WebsiteWebhookError } from "@/lib/website/webhook";

// Shown verbatim like a Google failure: it names which field the website refused, which is
// what an admin needs before pushing again.
function mapError(error: unknown): ActionResult<never> {
  if (error instanceof WebsiteWebhookError) {
    captureServiceError(error);
    return { success: false, error: error.message };
  }
  return mapActionError(error, {
    validation: "A honlap szinkronizálása nincs beállítva",
  });
}

export async function forceWebsiteFullSyncAction(): Promise<
  ActionResult<{ count: number }>
> {
  const actor = await permittedActor(canAdminister);
  if (!actor) return FORBIDDEN;

  try {
    const { count } = await forceWebsiteFullSync(prisma, actor);
    revalidatePath("/admin/sync-jobs");
    return { success: true, data: { count }, syncErrors: [] };
  } catch (error) {
    return mapError(error);
  }
}
