import type {
  MembershipStatus,
  PrismaClient,
} from "@/app/generated/prisma/client";
import { createUser, findAvailableUsername } from "@/lib/authentik/users";
import { deriveUsername } from "@/types";
import { executeSyncJob, type SyncResult } from "../executor";
import { getStatusGroupUuid } from "./group-mapping";

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
  const baseUsername = deriveUsername(data.firstName, data.lastName);
  const username = await findAvailableUsername(baseUsername);

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
  const job = await prisma.syncJob.create({
    data: {
      target: "AUTHENTIK",
      operation: "UPDATE_USER",
      memberId,
      payload: data as object,
    },
  });
  return executeSyncJob(prisma, job.id);
}

export async function orchestrateDeactivate(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  const job = await prisma.syncJob.create({
    data: {
      target: "AUTHENTIK",
      operation: "DEACTIVATE_USER",
      memberId,
      payload: {},
    },
  });
  return executeSyncJob(prisma, job.id);
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
  const job = await prisma.syncJob.create({
    data: {
      target: "AUTHENTIK",
      operation: "ADD_TO_GROUP",
      memberId,
      payload: { groupUuid },
    },
  });
  return executeSyncJob(prisma, job.id);
}

export async function orchestrateRemoveFromGroup(
  prisma: PrismaClient,
  memberId: string,
  groupUuid: string,
): Promise<SyncResult> {
  const job = await prisma.syncJob.create({
    data: {
      target: "AUTHENTIK",
      operation: "REMOVE_FROM_GROUP",
      memberId,
      payload: { groupUuid },
    },
  });
  return executeSyncJob(prisma, job.id);
}
