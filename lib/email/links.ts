import type { CatalogueEntry } from "./components";

// The studio's public applications, hardcoded rather than read from the AppLink rows /apps
// renders: a letter should say the same thing to everyone, whatever an admin has reordered
// or hidden that week.
const STUDIO_LINKS: CatalogueEntry[] = [
  { icon: "🌐", name: "BSS Web", url: "https://bsstudio.hu" },
  { icon: "📝", name: "BSS Wiki", url: "https://wiki.bsstudio.hu" },
  { icon: "🔑", name: "Autentik", url: "https://login.bsstudio.hu" },
  { icon: "📋", name: "Planka", url: "https://planka.bsstudio.hu" },
  { icon: "✉️", name: "Felkérések", url: "https://felkeres.bsstudio.hu" },
  { icon: "💬", name: "Mattermost", url: "https://mattermost.bsstudio.hu" },
  { icon: "📺", name: "Adásweb", url: "https://adasweb.bsstudio.hu" },
];

export const MATTERMOST_URL = "https://mattermost.bsstudio.hu";
export const PEK_URL = "https://pek.sch.bme.hu";

// Signed up for per semester, so this link outlives its poll. Replaced by hand until the
// onboarding session has a durable address.
export const ONBOARDING_SIGNUP_URL = "https://xoyondo.com/dp/2ef4d3xiaujhp4h";

// Backstage is the one entry that is not a fixed address: a deployment knows its own.
export function studioCatalogue(portalUrl: string): CatalogueEntry[] {
  return [...STUDIO_LINKS, { icon: "🎬", name: "Backstage", url: portalUrl }];
}
