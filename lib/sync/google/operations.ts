import { addGroupMember, removeGroupMember } from "@/lib/google/groups";
import type { OperationHandlers } from "../executor";

// The address is the identifier the group holds. Resolving it at execute time, the way the
// other targets resolve their pks, would let a retry act on an address it was never about.
export const googleGroupHandlers: OperationHandlers = {
  ADD_TO_GROUP: (payload) => addGroupMember(payload.email as string),
  REMOVE_FROM_GROUP: (payload) => removeGroupMember(payload.email as string),
};
