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
import { collectSyncErrors } from "@/lib/sync/executor";

export async function retrySyncJobAction(
  jobId: string,
): Promise<ActionResult<null>> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const result = await retrySyncJob(prisma, jobId, actor);
    revalidatePath("/admin/sync-jobs");
    return {
      success: true,
      data: null,
      syncErrors: collectSyncErrors([result]),
    };
  } catch (error) {
    return mapActionError(error, {
      validation: "Csak sikertelen feladatok indíthatók újra",
    });
  }
}
