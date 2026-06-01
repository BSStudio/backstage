import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  type CreateWebsiteUserInput,
  createWebsiteUser,
  deactivateWebsiteUser,
  type UpdateWebsiteUserInput,
  updateWebsiteUser,
} from "@/lib/website/users";
import type { OperationHandlers } from "../executor";

// Resolved at execute time rather than carried in the job payload, so a retry
// picks up a uid backfilled after the original failure.
async function resolveWebsiteUserId(
  prisma: PrismaClient,
  memberId: string,
): Promise<string> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true, websiteUserId: true },
  });
  /* v8 ignore next -- defense in depth; SyncJob.memberId is a required FK */
  if (!member) throw new Error(`Member not found: ${memberId}`);
  if (!member.websiteUserId) {
    throw new Error(
      `${member.lastName} ${member.firstName}: nincs összekötött weboldal-fiók`,
    );
  }
  return member.websiteUserId;
}

export const websiteHandlers: OperationHandlers = {
  CREATE_USER: (payload) =>
    createWebsiteUser(payload as CreateWebsiteUserInput),

  UPDATE_USER: async (payload, memberId, prisma) => {
    const userId = await resolveWebsiteUserId(prisma, memberId);
    await updateWebsiteUser(userId, payload as UpdateWebsiteUserInput);
    return { userId };
  },

  DEACTIVATE_USER: async (_payload, memberId, prisma) => {
    const userId = await resolveWebsiteUserId(prisma, memberId);
    await deactivateWebsiteUser(userId);
    return { userId };
  },
};
