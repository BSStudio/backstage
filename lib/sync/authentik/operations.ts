import type { PrismaClient } from "@/app/generated/prisma/client";
import { addUserToGroup, removeUserFromGroup } from "@/lib/authentik/groups";
import { createUser, getUserPk, updateUser } from "@/lib/authentik/users";
import type { OperationHandlers } from "../executor";
import { buildAuthentikAttributes } from "./attributes";

async function readMember(prisma: PrismaClient, memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mobile: true,
      avatarUrl: true,
    },
  });
  /* v8 ignore next -- defense in depth; SyncJob.memberId is a required FK */
  if (!member) throw new Error(`Member not found: ${memberId}`);
  return member;
}

export const authentikHandlers: OperationHandlers = {
  CREATE_USER: (payload) =>
    createUser(payload as Parameters<typeof createUser>[0]),

  // Authentik replaces `attributes` wholesale, and a retried payload may predate newer values
  // or the DN.
  UPDATE_USER: async (payload, memberId, prisma) => {
    const pk = await getUserPk(memberId);
    const data =
      "attributes" in payload
        ? {
            ...payload,
            attributes: buildAuthentikAttributes(
              await readMember(prisma, memberId),
            ),
          }
        : payload;
    return updateUser(pk, data as Parameters<typeof updateUser>[1]);
  },

  DEACTIVATE_USER: async (_payload, memberId) => {
    const pk = await getUserPk(memberId);
    return updateUser(pk, { is_active: false, path: "archived" });
  },

  REACTIVATE_USER: async (_payload, memberId) => {
    const pk = await getUserPk(memberId);
    return updateUser(pk, { is_active: true, path: "users" });
  },

  ADD_TO_GROUP: async (payload, memberId) => {
    const pk = await getUserPk(memberId);
    await addUserToGroup(payload.groupUuid as string, pk);
    return null;
  },

  REMOVE_FROM_GROUP: async (payload, memberId) => {
    const pk = await getUserPk(memberId);
    await removeUserFromGroup(payload.groupUuid as string, pk);
    return null;
  },
};
