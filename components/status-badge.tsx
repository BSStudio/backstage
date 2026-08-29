import type { MembershipStatus } from "@/app/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_BADGE_CLASS } from "@/lib/members";
import { MEMBERSHIP_STATUS_LABELS } from "@/types";

export function StatusBadge({ status }: { status: MembershipStatus }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE_CLASS[status]}>
      {MEMBERSHIP_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ArchivedBadge() {
  return (
    <Badge
      variant="outline"
      className="bg-status-archived/15 text-status-archived border-status-archived/40"
    >
      Archivált
    </Badge>
  );
}
