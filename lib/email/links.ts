import type { CatalogueEntry } from "./components";

// Hardcoded rather than read from the AppLink rows /apps renders: a letter should say the
// same thing to everyone, whatever an admin reordered or hid that week.
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

// A per-semester poll, replaced by hand: the onboarding session has no durable address.
// TODO: point this at bsstudio.hu/s/it-gyorstalpalo once the URL shortener lands, so a new
// semester's poll is a redirect an admin repoints rather than a release.
export const ONBOARDING_SIGNUP_URL = "https://xoyondo.com/dp/2ef4d3xiaujhp4h";

export function studioCatalogue(portalUrl: string): CatalogueEntry[] {
  return [...STUDIO_LINKS, { icon: "🎬", name: "Backstage", url: portalUrl }];
}
