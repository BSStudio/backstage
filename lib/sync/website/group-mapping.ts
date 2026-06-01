import type { MembershipStatus } from "@/app/generated/prisma/client";
import { WEBSITE_STATE } from "@/lib/website/users";

export function getWebsiteStatusLabel(status: MembershipStatus): string {
  return WEBSITE_STATE[status];
}
