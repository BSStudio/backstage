"use client";

import {
  type Column,
  type ColumnDef,
  columnFilteringFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import type { Member, MembershipStatus } from "@/app/generated/prisma/client";
import { ArchivedBadge, StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getInitials, STATUS_ORDER } from "@/lib/members";
import { formatSemester } from "@/types";

export type MemberRow = Member & {
  leadershipRole: { label: string } | null;
};

export const memberTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});

export type MemberColumnDef = ColumnDef<typeof memberTableFeatures, MemberRow>;

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
  column: Column<typeof memberTableFeatures, MemberRow>;
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

export const selectColumn: MemberColumnDef = {
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

export const avatarColumn: MemberColumnDef = {
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

export const nameColumn: MemberColumnDef = {
  id: "name",
  accessorFn: (m) => `${m.lastName} ${m.firstName}`,
  header: ({ column }) => <SortableHeader column={column}>Név</SortableHeader>,
  sortFn: sortFn_text,
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
    const tokens = String(value).toLowerCase().split(/\s+/).filter(Boolean);
    const m = row.original;
    const haystack = [m.lastName, m.firstName, m.nickname, m.email]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  },
};

export const statusColumn: MemberColumnDef = {
  accessorKey: "status",
  header: ({ column }) => (
    <SortableHeader column={column}>Státusz</SortableHeader>
  ),
  cell: ({ row }) => (
    <StatusBadge status={row.getValue("status") as MembershipStatus} />
  ),
  sortFn: (a, b) => {
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
export const statusWithArchivedColumn: MemberColumnDef = {
  ...statusColumn,
  cell: ({ row }) => {
    const status = row.getValue("status") as MembershipStatus;
    return (
      <div className="flex items-center gap-1">
        <StatusBadge status={status} />
        <ArchivedBadge />
      </div>
    );
  },
};

export const leadershipRoleColumn: MemberColumnDef = {
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

export const emailColumn: MemberColumnDef = {
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

export const mobileColumn: MemberColumnDef = {
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

export const universityColumn: MemberColumnDef = {
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

export const majorColumn: MemberColumnDef = {
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

export const joinedSemesterColumn: MemberColumnDef = {
  accessorKey: "joinedSemester",
  header: ({ column }) => (
    <SortableHeader column={column}>Belépés</SortableHeader>
  ),
  // "2025/2026/1" sorts correctly as plain text; alphanumeric would chunk it.
  sortFn: sortFn_text,
  cell: ({ row }) => (
    <span className="text-sm text-muted-foreground">
      {formatSemester(row.getValue("joinedSemester"))}
    </span>
  ),
};

export const archivedAtColumn: MemberColumnDef = {
  accessorKey: "archivedAt",
  header: ({ column }) => (
    <SortableHeader column={column}>Archiválva</SortableHeader>
  ),
  sortFn: sortFn_datetime,
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
