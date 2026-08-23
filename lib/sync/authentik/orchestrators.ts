import type {
  MembershipStatus,
  PrismaClient,
  SyncOperation,
} from "@/app/generated/prisma/client";
import { createUser } from "@/lib/authentik/users";
import { resolveAvailableUsername } from "@/lib/services/usernames";
import { NO_AUTHENTIK_ACCOUNT_REASON } from "@/lib/sync-jobs";
import { hasAuthentikAccount } from "@/types";
import { executeSyncJob, type SyncResult } from "../executor";
import { getStatusGroupUuid } from "./group-mapping";

// Skipped rather than failed: with no Authentik user there is no pk to resolve and no
// admin action that would change that. Still recorded, so an id wrongly carrying the
// prefix does not stop syncing silently.
async function runAuthentikJob(
  prisma: PrismaClient,
  memberId: string,
  operation: SyncOperation,
  payload: object,
): Promise<SyncResult> {
  if (!hasAuthentikAccount(memberId)) {
    await prisma.syncJob.create({
      data: {
        target: "AUTHENTIK",
        operation,
        memberId,
        payload,
        status: "SKIPPED",
        result: { reason: NO_AUTHENTIK_ACCOUNT_REASON },
      },
    });
    return { success: true, result: null };
  }

  const job = await prisma.syncJob.create({
    data: { target: "AUTHENTIK", operation, memberId, payload },
  });
  return executeSyncJob(prisma, job.id);
}

export function buildAuthentikAttributes(member: {
  firstName: string;
  lastName: string;
  mobile: string | null;
  avatarUrl: string | null;
}): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    first_name: member.firstName,
    last_name: member.lastName,
  };
  if (member.mobile) attrs.mobile = member.mobile;
  if (member.avatarUrl) attrs.avatar_url = member.avatarUrl;
  return attrs;
}

export async function createAuthentikUser(data: {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string | null;
  status: MembershipStatus;
}) {
  const username = await resolveAvailableUsername(
    data.firstName,
    data.lastName,
  );

  return createUser({
    username,
    name: `${data.firstName} ${data.lastName}`.trim(),
    email: data.email,
    path: "users",
    groups: [getStatusGroupUuid(data.status)],
    attributes: {
      first_name: data.firstName,
      last_name: data.lastName,
      ...(data.mobile ? { mobile: data.mobile } : {}),
    },
  });
}

export async function orchestrateUpdateAttributes(
  prisma: PrismaClient,
  memberId: string,
  data: {
    name?: string;
    email?: string;
    attributes?: Record<string, unknown>;
  },
): Promise<SyncResult> {
  return runAuthentikJob(prisma, memberId, "UPDATE_USER", data);
}

export async function orchestrateDeactivate(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runAuthentikJob(prisma, memberId, "DEACTIVATE_USER", {});
}

export async function orchestrateStatusChange(
  prisma: PrismaClient,
  memberId: string,
  fromStatus: MembershipStatus,
  toStatus: MembershipStatus,
): Promise<SyncResult[]> {
  const fromGroup = getStatusGroupUuid(fromStatus);
  const toGroup = getStatusGroupUuid(toStatus);

  if (fromGroup === toGroup) return [];

  const results: SyncResult[] = [];
  results.push(await orchestrateAddToGroup(prisma, memberId, toGroup));
  results.push(await orchestrateRemoveFromGroup(prisma, memberId, fromGroup));
  return results;
}

export async function orchestrateAddToGroup(
  prisma: PrismaClient,
  memberId: string,
  groupUuid: string,
): Promise<SyncResult> {
  return runAuthentikJob(prisma, memberId, "ADD_TO_GROUP", { groupUuid });
}

export async function orchestrateRemoveFromGroup(
  prisma: PrismaClient,
  memberId: string,
  groupUuid: string,
): Promise<SyncResult> {
  return runAuthentikJob(prisma, memberId, "REMOVE_FROM_GROUP", { groupUuid });
}
