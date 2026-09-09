import type {
  PrismaClient,
  SyncOperation,
} from "@/app/generated/prisma/client";
import { isDrupalConfigured } from "@/lib/drupal/client";
import {
  buildJoinYearFromSemester,
  type UpdateDrupalUserInput,
} from "@/lib/drupal/users";
import { NO_DRUPAL_CONFIG_REASON } from "@/lib/sync-jobs";
import { runSyncJob, type SyncResult } from "../executor";

// Skipped rather than failed: with no credentials there is nothing to call, and once the new
// site takes over there never will be again. The row is still written, so a deployment that
// lost its credentials by accident does not go quiet.
async function runDrupalJob(
  prisma: PrismaClient,
  memberId: string,
  operation: SyncOperation,
  payload: object,
): Promise<SyncResult> {
  return runSyncJob(
    prisma,
    { target: "DRUPAL", operation, memberId, payload },
    isDrupalConfigured() ? undefined : NO_DRUPAL_CONFIG_REASON,
  );
}

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
  return runDrupalJob(prisma, memberId, "CREATE_USER", {
    username: data.username,
    fullname: data.fullname,
    nickname: data.nickname,
    email: data.email,
    mobile: data.mobile,
    joinYear: buildJoinYearFromSemester(data.joinedSemester),
  });
}

export async function orchestrateUpdateDrupalUser(
  prisma: PrismaClient,
  memberId: string,
  fields: UpdateDrupalUserInput,
): Promise<SyncResult> {
  return runDrupalJob(prisma, memberId, "UPDATE_USER", { ...fields });
}

export async function orchestrateDeactivateDrupalUser(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runDrupalJob(prisma, memberId, "DEACTIVATE_USER", {});
}

export async function orchestrateReactivateDrupalUser(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runDrupalJob(prisma, memberId, "REACTIVATE_USER", {});
}
