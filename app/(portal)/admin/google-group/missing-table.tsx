"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAlumniStatus } from "@/types";
import type { MissingMemberRow } from "./types";

// Alumni and archived members are expected to be off the list, so they would bury the
// entries a leader is meant to act on.
function isExpectedAbsence(member: MissingMemberRow): boolean {
  return member.archived || isAlumniStatus(member.status);
}

export function MissingTable({ missing }: { missing: MissingMemberRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? missing : missing.filter((m) => !isExpectedAbsence(m));
  const expectedCount = missing.filter(isExpectedAbsence).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Nincs a listán ({rows.length})
          </h2>
          <p className="text-muted-foreground text-sm">
            Tagok, akiknek egyetlen címe sem szerepel a csoportban.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-alumni"
            checked={showAll}
            onCheckedChange={(checked) => setShowAll(checked === true)}
          />
          <Label htmlFor="show-alumni" className="font-normal">
            Öregtagok és archiváltak mutatása ({expectedCount})
          </Label>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Státusz</TableHead>
              <TableHead>Email-cím</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  Minden érintett tag rajta van a listán.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    {member.lastName} {member.firstName}
                    {member.archived ? " (archivált)" : ""}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={member.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {member.email}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
