import type { MembershipStatus } from "@/app/generated/prisma/client";
import { DRUPAL_STATE } from "@/lib/drupal/users";

export function getDrupalStatusLabel(status: MembershipStatus): string {
  return DRUPAL_STATE[status];
}
