import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  buildJoinYearFromSemester,
  type UpdateDrupalUserInput,
} from "@/lib/drupal/users";
import { runSyncJob, type SyncResult } from "../executor";

export interface CreateDrupalUserOrchestratorInput {
  username: string;
  fullname: string;
  nickname: string;
  email: string;
  mobile: string;
  joinedSemester: string;
}

export async function orchestrateCreateDrupalUser(
  prisma: PrismaClient,
  memberId: string,
  data: CreateDrupalUserOrchestratorInput,
): Promise<SyncResult> {
  return runSyncJob(prisma, {
    target: "DRUPAL",
    operation: "CREATE_USER",
    memberId,
    payload: {
      username: data.username,
      fullname: data.fullname,
      nickname: data.nickname,
      email: data.email,
      mobile: data.mobile,
      joinYear: buildJoinYearFromSemester(data.joinedSemester),
    },
  });
}

export async function orchestrateUpdateDrupalUser(
  prisma: PrismaClient,
  memberId: string,
  fields: UpdateDrupalUserInput,
): Promise<SyncResult> {
  return runSyncJob(prisma, {
    target: "DRUPAL",
    operation: "UPDATE_USER",
    memberId,
    payload: { ...fields },
  });
}

export async function orchestrateDeactivateDrupalUser(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runSyncJob(prisma, {
    target: "DRUPAL",
    operation: "DEACTIVATE_USER",
    memberId,
    payload: {},
  });
}

export async function orchestrateReactivateDrupalUser(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runSyncJob(prisma, {
    target: "DRUPAL",
    operation: "REACTIVATE_USER",
    memberId,
    payload: {},
  });
}
