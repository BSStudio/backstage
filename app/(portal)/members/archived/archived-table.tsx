"use client";

import { useMemo, useState } from "react";
import {
  archivedAtColumn,
  avatarColumn,
  emailColumn,
  joinedSemesterColumn,
  type MemberRow,
  majorColumn,
  mobileColumn,
  nameColumn,
  statusWithArchivedColumn,
  universityColumn,
} from "@/app/(portal)/members/columns";
import { DataTable } from "@/app/(portal)/members/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const columns = [
  avatarColumn,
  nameColumn,
  statusWithArchivedColumn,
  emailColumn,
  mobileColumn,
  universityColumn,
  majorColumn,
  joinedSemesterColumn,
  archivedAtColumn,
];

export function ArchivedTable({
  members,
  years,
}: {
  members: MemberRow[];
  years: number[];
}) {
  const [yearFilter, setYearFilter] = useState<string>("all");

  const filteredMembers = useMemo(() => {
    if (yearFilter === "all") return members;
    return members.filter(
      (m) =>
        m.archivedAt &&
        new Date(m.archivedAt).getFullYear() === Number(yearFilter),
    );
  }, [members, yearFilter]);

  return (
    <DataTable
      columns={columns}
      data={filteredMembers}
      initialSorting={[{ id: "archivedAt", desc: true }]}
      initialColumnVisibility={{ university: false, major: false }}
      toolbarExtra={
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Év szűrése" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden év</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
