import { appOrigin } from "@/lib/app-url";
import type { WelcomeEmailInput } from "@/lib/email/welcome";

export interface WelcomeEmailSource {
  firstName: string;
}

// Normalised like `authentikRequest` does, so a trailing slash cannot reach an href.
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
    // The letter claims a list membership only where there is a list to join.
    mailingListAddress: process.env.GOOGLE_GROUP_EMAIL || null,
  };
}
