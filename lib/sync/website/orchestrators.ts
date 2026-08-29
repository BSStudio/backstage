import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  buildJoinYearFromSemester,
  type UpdateWebsiteUserInput,
} from "@/lib/website/users";
import { runSyncJob, type SyncResult } from "../executor";

export interface CreateWebsiteUserOrchestratorInput {
  username: string;
  fullname: string;
  nickname: string;
  email: string;
  mobile: string;
  joinedSemester: string;
}

export async function orchestrateCreateWebsiteUser(
  prisma: PrismaClient,
  memberId: string,
  data: CreateWebsiteUserOrchestratorInput,
): Promise<SyncResult> {
  return runSyncJob(prisma, {
    target: "WEBSITE",
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

export async function orchestrateUpdateWebsiteUser(
  prisma: PrismaClient,
  memberId: string,
  fields: UpdateWebsiteUserInput,
): Promise<SyncResult> {
  return runSyncJob(prisma, {
    target: "WEBSITE",
    operation: "UPDATE_USER",
    memberId,
    payload: { ...fields },
  });
}

export async function orchestrateDeactivateWebsiteUser(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  return runSyncJob(prisma, {
    target: "WEBSITE",
    operation: "DEACTIVATE_USER",
    memberId,
    payload: {},
  });
}
