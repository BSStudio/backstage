import { authentikRequest } from "./client";

export async function addUserToGroup(
  groupUuid: string,
  userPk: number,
): Promise<void> {
  await authentikRequest(
    `/core/groups/${encodeURIComponent(groupUuid)}/add_user/`,
    {
      method: "POST",
      body: JSON.stringify({ pk: userPk }),
    },
  );
}

export async function removeUserFromGroup(
  groupUuid: string,
  userPk: number,
): Promise<void> {
  await authentikRequest(
    `/core/groups/${encodeURIComponent(groupUuid)}/remove_user/`,
    {
      method: "POST",
      body: JSON.stringify({ pk: userPk }),
    },
  );
}
