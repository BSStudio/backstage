import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  createDirectoryUser,
  replaceDirectoryAttributes,
} from "@/lib/active-directory/client";
import {
  activeDirectoryConfig,
  memberDistinguishedName,
} from "@/lib/active-directory/config";
import type { OperationHandlers } from "../executor";
import {
  buildDirectoryAttributes,
  buildDirectoryUser,
  generateInitialPassword,
} from "./attributes";

async function readMember(prisma: PrismaClient, memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, firstName: true, lastName: true, archived: true },
  });
  /* v8 ignore next -- defense in depth; SyncJob.memberId is a required FK */
  if (!member) throw new Error(`Member not found: ${memberId}`);
  return member;
}

// Read here rather than carried in the payload, so a retry applies the current names and
// archive state.
export const activeDirectoryHandlers: OperationHandlers = {
  CREATE_USER: async (payload, memberId, prisma) => {
    const { username } = payload;
    if (typeof username !== "string" || username === "") {
      throw new Error("CREATE_USER payload carries no username");
    }
    const member = await readMember(prisma, memberId);
    const dn = memberDistinguishedName(member.id);
    const { created } = await createDirectoryUser(
      dn,
      buildDirectoryUser(
        member,
        username,
        activeDirectoryConfig().upnSuffix,
        generateInitialPassword(),
      ),
    );
    return { dn, created };
  },

  SYNC_MEMBER: async (_payload, memberId, prisma) => {
    const member = await readMember(prisma, memberId);
    const dn = memberDistinguishedName(member.id);
    await replaceDirectoryAttributes(dn, buildDirectoryAttributes(member));
    return { dn };
  },
};
