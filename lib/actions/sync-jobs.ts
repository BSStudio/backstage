"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import { retrySyncJob } from "@/lib/services/sync-jobs";
import { getSession } from "@/lib/session";

type ActionResult =
  | { success: true; retried: true; syncSuccess: boolean; error?: string }
  | { success: false; error: string };

export async function retrySyncJobAction(jobId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const result = await retrySyncJob(prisma, jobId, {
      id: session.user.id,
      role: session.user.role,
    });
    revalidatePath("/admin/sync-jobs");
    return {
      success: true,
      retried: true,
      syncSuccess: result.success,
      error: result.success ? undefined : result.error,
    };
  } catch (error) {
    if (error instanceof NotFoundError)
      return { success: false, error: "Nem található" };
    if (error instanceof ForbiddenError)
      return { success: false, error: "Hozzáférés megtagadva" };
    /* v8 ignore else -- @preserve */
    if (error instanceof ValidationError)
      return {
        success: false,
        error: "Csak sikertelen feladatok újraindíthatók",
      };
    /* v8 ignore next -- @preserve */
    throw error;
  }
}
