import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  type CreateDrupalUserInput,
  createDrupalUser,
  deactivateDrupalUser,
  reactivateDrupalUser,
  type UpdateDrupalUserInput,
  updateDrupalUser,
} from "@/lib/drupal/users";
import type { OperationHandlers } from "../executor";

// Resolved at execute time rather than carried in the job payload, so a retry
// picks up a uid backfilled after the original failure.
async function resolveDrupalUserId(
  prisma: PrismaClient,
  memberId: string,
): Promise<string> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true, drupalUserId: true },
  });
  /* v8 ignore next -- defense in depth; SyncJob.memberId is a required FK */
  if (!member) throw new Error(`Member not found: ${memberId}`);
  if (!member.drupalUserId) {
    throw new Error(
      `${member.lastName} ${member.firstName}: nincs összekötött weboldal-fiók`,
    );
  }
  return member.drupalUserId;
}

export const drupalHandlers: OperationHandlers = {
  CREATE_USER: (payload) => createDrupalUser(payload as CreateDrupalUserInput),

  UPDATE_USER: async (payload, memberId, prisma) => {
    const userId = await resolveDrupalUserId(prisma, memberId);
    await updateDrupalUser(userId, payload as UpdateDrupalUserInput);
    return { userId };
  },

  DEACTIVATE_USER: async (_payload, memberId, prisma) => {
    const userId = await resolveDrupalUserId(prisma, memberId);
    await deactivateDrupalUser(userId);
    return { userId };
  },

  REACTIVATE_USER: async (_payload, memberId, prisma) => {
    const userId = await resolveDrupalUserId(prisma, memberId);
    await reactivateDrupalUser(userId);
    return { userId };
  },
};
