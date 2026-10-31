import { randomInt } from "node:crypto";
import { Attribute } from "ldapts";

// NORMAL_ACCOUNT | DONT_EXPIRE_PASSWORD
const USER_ACCOUNT_CONTROL_ENABLED = 0x10200;
// …plus ACCOUNTDISABLE
const USER_ACCOUNT_CONTROL_DISABLED = 0x10202;

const PASSWORD_ALPHABET = "0123456789!#$%&*+-=?@^_~";

interface DirectoryMember {
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
function encodeUnicodePwd(password: string): Buffer {
  return Buffer.from(`"${password}"`, "utf16le");
}

// AD will not enable an account without a password, and rejects one containing three letters
// of the account's names in a row.
export function generateInitialPassword(): string {
  const random = Array.from(
    { length: 40 },
    () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
  ).join("");
  return `${random}Aa1`;
}
