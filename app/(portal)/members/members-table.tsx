"use client";

import {
  avatarColumn,
  emailColumn,
  joinedSemesterColumn,
  leadershipRoleColumn,
  type MemberRow,
  majorColumn,
  mobileColumn,
  nameColumn,
  selectColumn,
  statusColumn,
  universityColumn,
} from "@/app/(portal)/members/columns";
import { DataTable } from "@/app/(portal)/members/data-table";
import { Button } from "@/components/ui/button";

const columns = [
  selectColumn,
  avatarColumn,
  nameColumn,
  statusColumn,
  leadershipRoleColumn,
  emailColumn,
  mobileColumn,
  universityColumn,
  majorColumn,
  joinedSemesterColumn,
];

export function MembersTable({ members }: { members: MemberRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={members}
      initialSorting={[{ id: "status", desc: false }]}
      initialColumnVisibility={{
        leadershipRole: false,
        university: false,
        major: false,
      }}
      renderSelectionBar={(selectedCount) => (
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
    />
  );
}
