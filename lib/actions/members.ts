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
  reactivateMember,
  removeRole,
  updateMember,
} from "@/lib/services/members";
import { sessionActor } from "@/lib/session";

// ─── Actions ─────────────────────────────────────────────────────────────────

// Every list is a slice of the same rows and a mutation can move a member between them,
// so all four are refreshed rather than each caller guessing which ones it touched.
const MEMBER_LIST_PATHS = [
  "/members",
  "/members/alumni",
  "/members/archived",
  "/members/leadership",
];

function revalidateMembers(...ids: string[]): void {
  for (const path of MEMBER_LIST_PATHS) revalidatePath(path);
  for (const id of ids) revalidatePath(`/members/${id}`);
}

export async function createMemberAction(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { member, username, syncErrors } = await createMember(
      prisma,
      input,
      actor,
    );
    revalidateMembers(member.id);
    return { success: true, data: { ...member, username }, syncErrors };
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
    revalidateMembers(id);
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
    revalidateMembers(id);
    return { success: true, data: { archived: true }, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function reactivateMemberAction(
  id: string,
): Promise<ActionResult> {
  const actor = await sessionActor();
  if (!actor) return UNAUTHORIZED;

  try {
    const { syncErrors } = await reactivateMember(prisma, id, actor);
    revalidateMembers(id);
    return { success: true, data: { archived: false }, syncErrors };
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
    revalidateMembers(...ids);
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
    revalidateMembers(...ids);
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
    revalidateMembers(memberId);
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
    revalidateMembers(memberId);
    return { success: true, data: null, syncErrors };
  } catch (error) {
    return mapActionError(error);
  }
}
