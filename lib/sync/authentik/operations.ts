import { addUserToGroup, removeUserFromGroup } from "@/lib/authentik/groups";
import { createUser, getUserPk, updateUser } from "@/lib/authentik/users";
import type { OperationHandlers } from "../executor";

export const authentikHandlers: OperationHandlers = {
  CREATE_USER: (payload) =>
    createUser(payload as Parameters<typeof createUser>[0]),

  UPDATE_USER: async (payload, memberId) => {
    const pk = await getUserPk(memberId);
    return updateUser(pk, payload as Parameters<typeof updateUser>[1]);
  },

  DEACTIVATE_USER: async (_payload, memberId) => {
    const pk = await getUserPk(memberId);
    return updateUser(pk, { is_active: false, path: "archived" });
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
