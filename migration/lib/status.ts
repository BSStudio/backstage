import type { MembershipStatus } from "../../app/generated/prisma/client";
import { WEBSITE_STATE } from "../../lib/website/users";
import { MEMBERSHIP_STATUS_LABELS } from "../../types";
import { normalizeName } from "./text";

// Built from the app's own label maps so the mapping cannot drift from what the
// sync layer writes back. Matching is on the whole normalized string, never a
// prefix — "stúdiós" is a prefix of "stúdiós jelölt".
function reverse(
  labels: Record<MembershipStatus, string>,
): [string, MembershipStatus][] {
  return (Object.entries(labels) as [MembershipStatus, string][]).map(
    ([status, label]) => [normalizeName(label), status],
  );
}

// The website's `profile_BSS_state` values.
const FROM_WEBSITE = new Map<string, MembershipStatus>(reverse(WEBSITE_STATE));

// The Sheet's `Pozíció` column, which uses the portal's display labels.
const FROM_LABEL = new Map<string, MembershipStatus>([
  ...reverse(MEMBERSHIP_STATUS_LABELS),
  ...reverse(WEBSITE_STATE),
]);

// Values the current site no longer writes but old rows still carry. Extend this
// from the unmapped list the loaders print — do not guess ahead of the data.
const LEGACY_ALIASES: Record<string, MembershipStatus> = {};

export function statusFromWebsiteLabel(
  label: string | null | undefined,
): MembershipStatus | null {
  const key = normalizeName(label);
  if (!key) return null;
  return FROM_WEBSITE.get(key) ?? LEGACY_ALIASES[key] ?? null;
}

/**
 * The Sheet's `Pozíció` column holds either a membership status or a leadership
 * role ("rádió műsorvezető"), with nothing to tell them apart but the value. A
 * null here means "not a status", which the caller reads as a role label.
 */
export function statusFromSheetPosition(
  position: string | null | undefined,
): MembershipStatus | null {
  const key = normalizeName(position);
  if (!key) return null;
  return FROM_LABEL.get(key) ?? LEGACY_ALIASES[key] ?? null;
}
