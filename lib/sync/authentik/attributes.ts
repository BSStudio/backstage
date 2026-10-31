import {
  isActiveDirectoryConfigured,
  memberDistinguishedName,
} from "@/lib/active-directory/config";
import { absoluteAppUrl } from "@/lib/app-url";

export function buildAuthentikAttributes(member: {
  id: string;
  firstName: string;
  lastName: string;
  mobile: string | null;
  avatarUrl: string | null;
}): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    first_name: member.firstName,
    last_name: member.lastName,
  };
  if (member.mobile) attrs.mobile = member.mobile;
  if (member.avatarUrl) attrs.avatar_url = absoluteAppUrl(member.avatarUrl);
  // Authentik's LDAP source writes passwords back only to users carrying this.
  if (isActiveDirectoryConfigured()) {
    attrs.distinguishedName = memberDistinguishedName(member.id);
  }
  return attrs;
}
