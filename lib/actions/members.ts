"use server";

import { revalidatePath } from "next/cache";
import type { MembershipStatus } from "@/app/generated/prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import {
  type ArchiveOptions,
  archiveMember,
  assignRole,
  batchArchive,
  batchUpdateStatus,
  createMember,
  removeRole,
  updateMember,
} from "@/lib/services/members";
import { getSession } from "@/lib/session";
import type { UserRole } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ActionResult<T = unknown> =
  | { success: true; data: T; syncErrors?: string[] }
  | { success: false; error: string };

function actorFromSession(session: {
  user: { id: string; role: string };
}): Actor {
  return { id: session.user.id, role: session.user.role as UserRole };
}

function mapError(error: unknown): ActionResult<never> {
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

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createMemberAction(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const { member, syncErrors } = await createMember(
      prisma,
      input,
      actorFromSession(session),
    );
    revalidatePath("/members");
    return { success: true, data: member, syncErrors };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateMemberAction(
  id: string,
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const { member, syncErrors } = await updateMember(
      prisma,
      id,
      input,
      actorFromSession(session),
    );
    revalidatePath("/members");
    revalidatePath(`/members/${id}`);
    return { success: true, data: member, syncErrors };
  } catch (error) {
    return mapError(error);
  }
}

export async function archiveMemberAction(
  id: string,
  options: ArchiveOptions = {},
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const { syncErrors } = await archiveMember(
      prisma,
      id,
      actorFromSession(session),
      options,
    );
    revalidatePath("/members");
    return { success: true, data: { archived: true }, syncErrors };
  } catch (error) {
    return mapError(error);
  }
}

export async function batchArchiveAction(
  ids: string[],
  options: ArchiveOptions = {},
): Promise<ActionResult<{ count: number }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const { count, syncErrors } = await batchArchive(
      prisma,
      ids,
      actorFromSession(session),
      options,
    );
    revalidatePath("/members");
    return { success: true, data: { count }, syncErrors };
  } catch (error) {
    return mapError(error);
  }
}

export async function batchUpdateStatusAction(
  ids: string[],
  status: MembershipStatus,
): Promise<ActionResult<{ count: number }>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const { count, syncErrors } = await batchUpdateStatus(
      prisma,
      ids,
      status,
      actorFromSession(session),
    );
    revalidatePath("/members");
    return { success: true, data: { count }, syncErrors };
  } catch (error) {
    return mapError(error);
  }
}

export async function assignRoleAction(
  memberId: string,
  label: string,
  authentikGroupIds: string[],
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const { syncErrors } = await assignRole(
      prisma,
      memberId,
      label,
      authentikGroupIds,
      actorFromSession(session),
    );
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { success: true, data: null, syncErrors };
  } catch (error) {
    return mapError(error);
  }
}

export async function removeRoleAction(
  memberId: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Jogosulatlan hozzáférés" };

  try {
    const { syncErrors } = await removeRole(
      prisma,
      memberId,
      actorFromSession(session),
    );
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { success: true, data: null, syncErrors };
  } catch (error) {
    return mapError(error);
  }
}
