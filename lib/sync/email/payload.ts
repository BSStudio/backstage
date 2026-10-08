import { appOrigin } from "@/lib/app-url";
import type { WelcomeEmailInput } from "@/lib/email/welcome";

export interface WelcomeEmailSource {
  firstName: string;
}

// Authentik's own base URL, where the letter points for the first sign-in. Normalised the
// way `authentikRequest` normalises it, so a configured trailing slash cannot reach an href.
function authentikUrl(): string {
  const url = process.env.AUTHENTIK_URL;
  if (!url) {
    throw new Error("Missing AUTHENTIK_URL, needed by the welcome email");
  }
  return url.replace(/\/+$/, "");
}

export function buildWelcomeEmail(
  member: WelcomeEmailSource,
  username: string,
): WelcomeEmailInput {
  return {
    firstName: member.firstName,
    username,
    portalUrl: appOrigin(),
    loginUrl: authentikUrl(),
    // The letter says the member was put on the list, which is only true where there is
    // one — the same condition under which `createMember` adds the address.
    mailingListAddress: process.env.GOOGLE_GROUP_EMAIL || null,
  };
}
