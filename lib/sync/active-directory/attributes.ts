import { randomBytes } from "node:crypto";
import { Attribute } from "ldapts";

// NORMAL_ACCOUNT | DONT_EXPIRE_PASSWORD: Authentik owns the password, so AD must never expire it.
export const USER_ACCOUNT_CONTROL_ENABLED = 0x10200;
// …plus ACCOUNTDISABLE.
export const USER_ACCOUNT_CONTROL_DISABLED = 0x10202;

export interface DirectoryMember {
  firstName: string;
  lastName: string;
  archived: boolean;
}

export function buildDirectoryAttributes(member: DirectoryMember) {
  return {
    givenName: member.firstName,
    sn: member.lastName,
    displayName: `${member.firstName} ${member.lastName}`,
    userAccountControl: String(
      member.archived
        ? USER_ACCOUNT_CONTROL_DISABLED
        : USER_ACCOUNT_CONTROL_ENABLED,
    ),
  };
}

export function buildDirectoryUser(
  member: DirectoryMember & { id: string },
  username: string,
  upnSuffix: string,
  password: string,
): Attribute[] {
  const values: Record<string, string[] | Buffer[]> = {
    objectClass: ["top", "person", "organizationalPerson", "user"],
    cn: [member.id],
    sAMAccountName: [username],
    userPrincipalName: [`${username}@${upnSuffix}`],
    ...Object.fromEntries(
      Object.entries(buildDirectoryAttributes(member)).map(([type, value]) => [
        type,
        [value],
      ]),
    ),
    unicodePwd: [encodeUnicodePwd(password)],
  };
  return Object.entries(values).map(
    ([type, attributeValues]) =>
      new Attribute({ type, values: attributeValues }),
  );
}

// AD reads `unicodePwd` as the password wrapped in double quotes, encoded UTF-16LE.
export function encodeUnicodePwd(password: string): Buffer {
  return Buffer.from(`"${password}"`, "utf16le");
}

// AD refuses an enabled account without a password. Nobody is ever told this one: Authentik's
// writeback replaces it the first time the member sets theirs. The suffix guarantees the
// character classes AD's complexity policy counts.
export function generateInitialPassword(): string {
  return `${randomBytes(32).toString("base64url")}Aa1!`;
}
