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

async function fetchMemberships(): Promise<Membership[]> {
  const parent = await getGroupResourceName();
  const memberships: Membership[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ view: "FULL", pageSize: "500" });
    if (pageToken) params.set("pageToken", pageToken);

    const page = await googleRequest<MembershipsPage>(
      `/${parent}/memberships?${params}`,
    );
    memberships.push(...(page.memberships ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return memberships;
}

export async function listGroupMembers(): Promise<GoogleGroupMember[]> {
  const members: GoogleGroupMember[] = [];

  for (const membership of await fetchMemberships()) {
    const email = membership.preferredMemberKey?.id;
    if (!email) continue;
    members.push({
      email: email.toLowerCase(),
      roles: (membership.roles ?? []).map((role) => role.name),
    });
  }

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
  const wanted = email.toLowerCase();
  const membership = (await fetchMemberships()).find(
    (entry) => entry.preferredMemberKey?.id?.toLowerCase() === wanted,
  );

  // Not on the list, so a retry of an already-applied removal stays green.
  if (!membership) return { removed: false };

  await googleRequest(`/${membership.name}`, {
    method: "DELETE",
    scope: GOOGLE_SCOPE_WRITE,
  });
  return { removed: true };
}
