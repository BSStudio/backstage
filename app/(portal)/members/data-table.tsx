"use client";

import {
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  COLUMN_LABELS,
  type MemberColumnDef,
  type MemberRow,
  memberTableFeatures,
} from "./columns";

export type DataTableProps = {
  columns: MemberColumnDef[];
  data: MemberRow[];
  initialSorting?: SortingState;
  initialColumnVisibility?: ColumnVisibilityState;
  /** Renders inside the toolbar between search and column toggle (for filters) */
  toolbarExtra?: React.ReactNode;
  /** Renders as a second bar below the toolbar when rows are selected */
  renderSelectionBar?: (info: {
    selectedCount: number;
    selectedRows: MemberRow[];
    resetSelection: () => void;
  }) => React.ReactNode;
};

export function DataTable({
  columns,
  data,
  initialSorting = [],
  initialColumnVisibility = {},
  toolbarExtra,
  renderSelectionBar,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(initialColumnVisibility);
  const [rowSelection, setRowSelection] = useState({});

  const table = useTable({
    features: memberTableFeatures,
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const nameColumn = table.getColumn("name");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {nameColumn && (
          <Input
            placeholder="Keresés név, becenév, email alapján..."
            value={(nameColumn.getFilterValue() as string) ?? ""}
            onChange={(event) => nameColumn.setFilterValue(event.target.value)}
            className="text-sm sm:max-w-sm"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
          />
        )}
        {toolbarExtra}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="sm:ml-auto">
              <Settings2 className="mr-2 size-4" />
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

      {renderSelectionBar &&
        selectedCount > 0 &&
        renderSelectionBar({
          selectedCount,
          selectedRows: table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original),
          resetSelection: () => setRowSelection({}),
        })}

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      width:
                        header.getSize() !== 150 ? header.getSize() : undefined,
                    }}
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
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
                      <table.FlexRender cell={cell} />
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
