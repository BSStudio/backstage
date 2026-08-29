"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  mapActionError,
  UNAUTHORIZED,
} from "@/lib/actions/result";
import prisma from "@/lib/prisma";
import { retrySyncJob } from "@/lib/services/sync-jobs";
import { sessionActor } from "@/lib/session";

export async function retrySyncJobAction(
  jobId: string,
): Promise<ActionResult<{ syncSuccess: boolean; syncError?: string }>> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const result = await retrySyncJob(prisma, jobId, actor);
    revalidatePath("/admin/sync-jobs");
    return {
      success: true,
      data: {
        syncSuccess: result.success,
        syncError: result.success ? undefined : result.error,
      },
    };
  } catch (error) {
    return mapActionError(error, {
      validation: "Csak sikertelen feladatok indíthatók újra",
    });
  }
}
