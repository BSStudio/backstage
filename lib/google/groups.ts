import {
  GOOGLE_SCOPE_WRITE,
  GoogleApiError,
  getGroupEmail,
  googleRequest,
} from "./client";

export interface GoogleGroupMember {
  email: string;
  roles: string[];
}

interface Membership {
  name: string;
  preferredMemberKey?: { id?: string };
  roles?: { name: string }[];
}

interface MembershipsPage {
  memberships?: Membership[];
  nextPageToken?: string;
}

let cachedGroupName: { groupEmail: string; name: string } | null = null;

async function getGroupResourceName(): Promise<string> {
  const groupEmail = getGroupEmail();
  if (cachedGroupName?.groupEmail === groupEmail) return cachedGroupName.name;

  const { name } = await googleRequest<{ name: string }>(
    `/groups:lookup?groupKey.id=${encodeURIComponent(groupEmail)}`,
  );
  cachedGroupName = { groupEmail, name };
  return name;
}

export async function listGroupMembers(): Promise<GoogleGroupMember[]> {
  const parent = await getGroupResourceName();
  const members: GoogleGroupMember[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ view: "FULL", pageSize: "500" });
    if (pageToken) params.set("pageToken", pageToken);

    const page = await googleRequest<MembershipsPage>(
      `/${parent}/memberships?${params}`,
    );
    for (const membership of page.memberships ?? []) {
      const email = membership.preferredMemberKey?.id;
      if (!email) continue;
      members.push({
        email: email.toLowerCase(),
        roles: (membership.roles ?? []).map((role) => role.name),
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return members;
}

export async function addGroupMember(
  email: string,
): Promise<{ added: boolean }> {
  const parent = await getGroupResourceName();
  try {
    await googleRequest(`/${parent}/memberships`, {
      method: "POST",
      body: JSON.stringify({
        preferredMemberKey: { id: email },
        roles: [{ name: "MEMBER" }],
      }),
      scope: GOOGLE_SCOPE_WRITE,
    });
    return { added: true };
  } catch (error) {
    // Already a member: the end state is the one we asked for.
    if (error instanceof GoogleApiError && error.status === 409) {
      return { added: false };
    }
    throw error;
  }
}

export async function removeGroupMember(
  email: string,
): Promise<{ removed: boolean }> {
  const parent = await getGroupResourceName();

  let membershipName: string;
  try {
    const lookup = await googleRequest<{ name: string }>(
      `/${parent}/memberships:lookup?memberKey.id=${encodeURIComponent(email)}`,
    );
    membershipName = lookup.name;
  } catch (error) {
    // A retry of an already-applied removal must not fail.
    if (error instanceof GoogleApiError && error.status === 404) {
      return { removed: false };
    }
    throw error;
  }

  await googleRequest(`/${membershipName}`, {
    method: "DELETE",
    scope: GOOGLE_SCOPE_WRITE,
  });
  return { removed: true };
}
