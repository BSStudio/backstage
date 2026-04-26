"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import type { Member, MembershipStatus } from "@/app/generated/prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getInitials, STATUS_BADGE_CLASS, STATUS_ORDER } from "@/lib/members";
import { formatSemester, MEMBERSHIP_STATUS_LABELS } from "@/types";

export type MemberRow = Member & {
  leadershipRole: { label: string } | null;
};

export const COLUMN_LABELS: Record<string, string> = {
  avatar: "Kép",
  name: "Név",
  status: "Státusz",
  leadershipRole: "Pozíció",
  email: "Email",
  mobile: "Telefon",
  university: "Egyetem",
  major: "Szak",
  joinedSemester: "Belépés",
  archivedAt: "Archiválva",
};

export function SortIcon({ sorted }: { sorted: "asc" | "desc" | false }) {
  if (sorted === "asc") return <ArrowUp className="ml-2 size-3" />;
  if (sorted === "desc") return <ArrowDown className="ml-2 size-3" />;
  return <ArrowUpDown className="ml-2 size-3 text-muted-foreground/50" />;
}

function SortableHeader({
  column,
  children,
}: {
  column: import("@tanstack/react-table").Column<MemberRow>;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {children}
      <SortIcon sorted={column.getIsSorted()} />
    </Button>
  );
}

// ─── Individual column definitions ───────────────────────────────────────────

export const selectColumn: ColumnDef<MemberRow> = {
  id: "select",
  size: 16,
  header: ({ table }) => (
    <Checkbox
      checked={
        table.getIsAllPageRowsSelected() ||
        (table.getIsSomePageRowsSelected() && "indeterminate")
      }
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label="Mindet kijelölni"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      aria-label="Sor kijelölése"
    />
  ),
  enableSorting: false,
  enableHiding: false,
};

export const avatarColumn: ColumnDef<MemberRow> = {
  id: "avatar",
  header: "",
  size: 40,
  cell: ({ row }) => {
    const m = row.original;
    return (
      <Avatar className="size-8">
        {m.avatarUrl && (
          <AvatarImage src={m.avatarUrl} alt={`${m.lastName} ${m.firstName}`} />
        )}
        <AvatarFallback className="text-xs">
          {getInitials(m.firstName, m.lastName)}
        </AvatarFallback>
      </Avatar>
    );
  },
  enableSorting: false,
  enableHiding: false,
};

export const nameColumn: ColumnDef<MemberRow> = {
  id: "name",
  accessorFn: (m) => `${m.lastName} ${m.firstName}`,
  header: ({ column }) => <SortableHeader column={column}>Név</SortableHeader>,
  cell: ({ row }) => {
    const m = row.original;
    return (
      <Link href={`/members/${m.id}`} className="group">
        <span className="font-medium group-hover:underline">
          {m.lastName} {m.firstName}
        </span>
        {m.nickname && (
          <span className="ml-2 text-xs text-muted-foreground">
            ({m.nickname})
          </span>
        )}
      </Link>
    );
  },
  filterFn: (row, _id, value) => {
    const m = row.original;
    const search = String(value).toLowerCase();
    return (
      m.firstName.toLowerCase().includes(search) ||
      m.lastName.toLowerCase().includes(search) ||
      (m.nickname?.toLowerCase().includes(search) ?? false) ||
      m.email.toLowerCase().includes(search)
    );
  },
};

function statusBadge(status: MembershipStatus) {
  return (
    <Badge variant="outline" className={STATUS_BADGE_CLASS[status]}>
      {MEMBERSHIP_STATUS_LABELS[status]}
    </Badge>
  );
}

export const statusColumn: ColumnDef<MemberRow> = {
  accessorKey: "status",
  header: ({ column }) => (
    <SortableHeader column={column}>Státusz</SortableHeader>
  ),
  cell: ({ row }) => statusBadge(row.getValue("status") as MembershipStatus),
  sortingFn: (a, b) => {
    const aOrder = STATUS_ORDER[a.getValue("status") as MembershipStatus];
    const bOrder = STATUS_ORDER[b.getValue("status") as MembershipStatus];
    return aOrder - bOrder;
  },
  filterFn: (row, id, value) => {
    const filter = value as MembershipStatus[];
    if (filter.length === 0) return true;
    return filter.includes(row.getValue(id) as MembershipStatus);
  },
};

/** Status column with an additional "Archivált" badge next to it. */
export const statusWithArchivedColumn: ColumnDef<MemberRow> = {
  ...statusColumn,
  cell: ({ row }) => {
    const status = row.getValue("status") as MembershipStatus;
    return (
      <div className="flex items-center gap-1">
        {statusBadge(status)}
        <Badge
          variant="outline"
          className="bg-status-archived/15 text-status-archived border-status-archived/40 dark:bg-status-archived/20 dark:border-status-archived/30"
        >
          Archivált
        </Badge>
      </div>
    );
  },
};

export const leadershipRoleColumn: ColumnDef<MemberRow> = {
  id: "leadershipRole",
  header: "Pozíció",
  cell: ({ row }) => {
    const role = row.original.leadershipRole;
    return role ? (
      <span className="text-sm">{role.label}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  },
  enableSorting: false,
};

export const emailColumn: ColumnDef<MemberRow> = {
  accessorKey: "email",
  header: "Email",
  cell: ({ row }) => (
    <a
      href={`mailto:${row.getValue("email")}`}
      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
    >
      {row.getValue("email")}
    </a>
  ),
};

export const mobileColumn: ColumnDef<MemberRow> = {
  accessorKey: "mobile",
  header: "Telefon",
  cell: ({ row }) => {
    const mobile = row.getValue("mobile") as string | null;
    return mobile ? (
      <a
        href={`tel:${mobile}`}
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        {mobile}
      </a>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  },
};

export const universityColumn: ColumnDef<MemberRow> = {
  accessorKey: "university",
  header: "Egyetem",
  cell: ({ row }) => {
    const uni = row.getValue("university") as string | null;
    return uni ? (
      <span className="text-sm text-muted-foreground">{uni}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  },
};

export const majorColumn: ColumnDef<MemberRow> = {
  accessorKey: "major",
  header: "Szak",
  cell: ({ row }) => {
    const major = row.getValue("major") as string | null;
    return major ? (
      <span className="text-sm text-muted-foreground">{major}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  },
};

export const joinedSemesterColumn: ColumnDef<MemberRow> = {
  accessorKey: "joinedSemester",
  header: ({ column }) => (
    <SortableHeader column={column}>Belépés</SortableHeader>
  ),
  cell: ({ row }) => (
    <span className="text-sm text-muted-foreground">
      {formatSemester(row.getValue("joinedSemester"))}
    </span>
  ),
};

export const archivedAtColumn: ColumnDef<MemberRow> = {
  accessorKey: "archivedAt",
  header: ({ column }) => (
    <SortableHeader column={column}>Archiválva</SortableHeader>
  ),
  cell: ({ row }) => {
    const archivedAt = row.getValue("archivedAt") as Date | null;
    if (!archivedAt) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="text-sm text-muted-foreground">
        {new Date(archivedAt).toLocaleDateString("hu-HU")}
      </span>
    );
  },
};
