"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Member, MembershipStatus } from "@/app/generated/prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInitials, STATUS_BADGE_CLASS, STATUS_ORDER } from "@/lib/members";
import { formatSemester, MEMBERSHIP_STATUS_LABELS } from "@/types";

type MemberRow = Member & { leadershipRole: { label: string } | null };

function SortIcon({ sorted }: { sorted: "asc" | "desc" | false }) {
  if (sorted === "asc") return <ArrowUp className="ml-2 h-3 w-3" />;
  if (sorted === "desc") return <ArrowDown className="ml-2 h-3 w-3" />;
  return <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground/50" />;
}

const COLUMN_LABELS: Record<string, string> = {
  avatar: "Kép",
  name: "Név",
  status: "Státusz",
  leadershipRole: "Pozíció",
  email: "Email",
  mobile: "Telefon",
  university: "Egyetem",
  major: "Szak",
  joinedSemester: "Belépés",
};

const columns: ColumnDef<MemberRow>[] = [
  {
    id: "select",
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
  },
  {
    id: "avatar",
    header: "",
    cell: ({ row }) => {
      const m = row.original;
      return (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {getInitials(m.firstName, m.lastName)}
          </AvatarFallback>
        </Avatar>
      );
    },
    enableSorting: false,
  },
  {
    id: "name",
    accessorFn: (m) => `${m.lastName} ${m.firstName}`,
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Név
        <SortIcon sorted={column.getIsSorted()} />
      </Button>
    ),
    cell: ({ row }) => {
      const m = row.original;
      const display = `${m.lastName} ${m.firstName}`;
      return (
        <Link href={`/members/${m.id}`} className="group">
          <span className="font-medium group-hover:underline">{display}</span>
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
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Státusz
        <SortIcon sorted={column.getIsSorted()} />
      </Button>
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as MembershipStatus;
      return (
        <Badge variant="outline" className={STATUS_BADGE_CLASS[status]}>
          {MEMBERSHIP_STATUS_LABELS[status]}
        </Badge>
      );
    },
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    accessorKey: "joinedSemester",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Belépés
        <SortIcon sorted={column.getIsSorted()} />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatSemester(row.getValue("joinedSemester"))}
      </span>
    ),
  },
];

export function MembersTable({ members }: { members: MemberRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "status", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    leadershipRole: false,
    university: false,
    major: false,
  });
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data: members,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Keresés név, becenév, email alapján..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("name")?.setFilterValue(event.target.value)
          }
          className="text-sm sm:max-w-sm"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="sm:ml-auto">
              <Settings2 className="mr-2 h-4 w-4" />
              Oszlopok
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Látható oszlopok</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {COLUMN_LABELS[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Selection actions bar */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {selectedCount} kijelölve
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled>
              Státusz módosítása
            </Button>
            <Button variant="outline" size="sm" disabled>
              Archiválás
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nincs találat.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
