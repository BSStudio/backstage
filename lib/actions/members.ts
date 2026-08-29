"use server";

import { revalidatePath } from "next/cache";
import type { MembershipStatus } from "@/app/generated/prisma/client";
import {
  type ActionResult,
  mapActionError,
  UNAUTHORIZED,
} from "@/lib/actions/result";
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
import { sessionActor } from "@/lib/session";

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createMemberAction(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { member, syncErrors } = await createMember(prisma, input, actor);
    revalidatePath("/members");
    return { success: true, data: member, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function updateMemberAction(
  id: string,
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { member, syncErrors } = await updateMember(prisma, id, input, actor);
    revalidatePath("/members");
    revalidatePath(`/members/${id}`);
    return { success: true, data: member, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function archiveMemberAction(
  id: string,
  options: ArchiveOptions = {},
): Promise<ActionResult> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { syncErrors } = await archiveMember(prisma, id, actor, options);
    revalidatePath("/members");
    return { success: true, data: { archived: true }, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function batchArchiveAction(
  ids: string[],
  options: ArchiveOptions = {},
): Promise<ActionResult<{ count: number }>> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { count, syncErrors } = await batchArchive(
      prisma,
      ids,
      actor,
      options,
    );
    revalidatePath("/members");
    return { success: true, data: { count }, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function batchUpdateStatusAction(
  ids: string[],
  status: MembershipStatus,
): Promise<ActionResult<{ count: number }>> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { count, syncErrors } = await batchUpdateStatus(
      prisma,
      ids,
      status,
      actor,
    );
    revalidatePath("/members");
    return { success: true, data: { count }, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function assignRoleAction(
  memberId: string,
  label: string,
  authentikGroupIds: string[],
): Promise<ActionResult> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { syncErrors } = await assignRole(
      prisma,
      memberId,
      label,
      authentikGroupIds,
      actor,
    );
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { success: true, data: null, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function removeRoleAction(
  memberId: string,
): Promise<ActionResult> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { syncErrors } = await removeRole(prisma, memberId, actor);
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { success: true, data: null, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}
