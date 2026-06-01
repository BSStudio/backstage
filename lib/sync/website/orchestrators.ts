import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  buildJoinYearFromSemester,
  type UpdateWebsiteUserInput,
} from "@/lib/website/users";
import { executeSyncJob, type SyncResult } from "../executor";

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
  const job = await prisma.syncJob.create({
    data: {
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
    },
  });
  return executeSyncJob(prisma, job.id);
}

export async function orchestrateUpdateWebsiteUser(
  prisma: PrismaClient,
  memberId: string,
  fields: UpdateWebsiteUserInput,
): Promise<SyncResult> {
  const job = await prisma.syncJob.create({
    data: {
      target: "WEBSITE",
      operation: "UPDATE_USER",
      memberId,
      payload: { ...fields },
    },
  });
  return executeSyncJob(prisma, job.id);
}

export async function orchestrateDeactivateWebsiteUser(
  prisma: PrismaClient,
  memberId: string,
): Promise<SyncResult> {
  const job = await prisma.syncJob.create({
    data: {
      target: "WEBSITE",
      operation: "DEACTIVATE_USER",
      memberId,
      payload: {},
    },
  });
  return executeSyncJob(prisma, job.id);
}
