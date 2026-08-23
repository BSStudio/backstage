import type { MembershipStatus } from "../../app/generated/prisma/client";
import { WEBSITE_STATE } from "../../lib/website/users";
import { normalizeName } from "./text";

// Built from WEBSITE_STATE so the mapping cannot drift from what the sync layer
// writes back. Matching is on the whole normalized string, never a prefix —
// "stúdiós" is a prefix of "stúdiós jelölt".
const FROM_WEBSITE = new Map<string, MembershipStatus>(
  (Object.entries(WEBSITE_STATE) as [MembershipStatus, string][]).map(
    ([status, label]) => [normalizeName(label), status],
  ),
);

// Values the current site no longer writes but old rows still carry. Extend this
// from the unmapped list that `load-drupal.ts` prints — do not guess ahead of the
// data.
const LEGACY_ALIASES: Record<string, MembershipStatus> = {};

export function statusFromWebsiteLabel(
  label: string | null | undefined,
): MembershipStatus | null {
  const key = normalizeName(label);
  if (!key) return null;
  return FROM_WEBSITE.get(key) ?? LEGACY_ALIASES[key] ?? null;
}

export function websiteStatusLabels(): string[] {
  return [...FROM_WEBSITE.keys(), ...Object.keys(LEGACY_ALIASES)];
}
