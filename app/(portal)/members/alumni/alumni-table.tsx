"use client";

import {
  avatarColumn,
  emailColumn,
  joinedSemesterColumn,
  type MemberRow,
  majorColumn,
  mobileColumn,
  nameColumn,
  statusColumn,
  universityColumn,
} from "@/app/(portal)/members/columns";
import { DataTable } from "@/app/(portal)/members/data-table";

const columns = [
  avatarColumn,
  nameColumn,
  statusColumn,
  emailColumn,
  mobileColumn,
  universityColumn,
  majorColumn,
  joinedSemesterColumn,
];

export function AlumniTable({ members }: { members: MemberRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={members}
      initialSorting={[{ id: "name", desc: false }]}
      initialColumnVisibility={{ university: false, major: false }}
    />
  );
}
