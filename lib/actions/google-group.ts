"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { GoogleApiError } from "@/lib/google/client";
import { captureServiceError } from "@/lib/observability/capture";
import prisma from "@/lib/prisma";
import {
  annotateGoogleGroupEntry,
  refreshGoogleGroupEntries,
} from "@/lib/services/google-group";
import type { Actor } from "@/lib/services/members";
import { getSession } from "@/lib/session";
import type { UserRole } from "@/types";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

async function requireAdminActor(): Promise<Actor | null> {
  const session = await getSession();
  if (session?.user.role !== "ADMIN") return null;
  return { id: session.user.id, role: session.user.role as UserRole };
}

// A Google failure is the one error worth showing verbatim: it names what the API refused,
// which is what an admin needs before touching the group by hand.
function mapError(error: unknown): ActionResult<never> {
  if (error instanceof GoogleApiError) {
    captureServiceError(error);
    return { success: false, error: error.message };
  }
  if (error instanceof NotFoundError)
    return { success: false, error: "Nem található" };
  if (error instanceof ForbiddenError)
    return { success: false, error: "Hozzáférés megtagadva" };
  /* v8 ignore else -- @preserve */
  if (error instanceof ValidationError)
    return { success: false, error: "Érvénytelen adatok" };
  /* v8 ignore next -- @preserve */
  throw error;
}

export async function refreshGoogleGroupAction(): Promise<
  ActionResult<{ count: number }>
> {
  const actor = await requireAdminActor();
  if (!actor) return { success: false, error: "Hozzáférés megtagadva" };

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
  const actor = await requireAdminActor();
  if (!actor) return { success: false, error: "Hozzáférés megtagadva" };

  try {
    const entry = await annotateGoogleGroupEntry(prisma, email, input, actor);
    revalidatePath("/admin/google-group");
    return { success: true, data: { email: entry.email } };
  } catch (error) {
    return mapError(error);
  }
}
