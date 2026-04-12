"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import type { MembershipStatus } from "@/app/generated/prisma/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  batchArchiveAction,
  batchUpdateStatusAction,
} from "@/lib/actions/members";
import { MEMBERSHIP_STATUS_LABELS, MEMBERSHIP_STATUSES } from "@/types";

const baseColumns = [
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

export function MembersTable({
  members,
  canManage,
}: {
  members: MemberRow[];
  canManage: boolean;
}) {
  const columns = canManage ? [selectColumn, ...baseColumns] : baseColumns;
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "status" | "archive" | null
  >(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveData, setArchiveData] = useState<{
    ids: string[];
    count: number;
    reset: () => void;
  } | null>(null);

  function handleStatusChange(
    status: MembershipStatus,
    selectedRows: MemberRow[],
    resetSelection: () => void,
  ) {
    const ids = selectedRows.map((r) => r.id);
    setPendingAction("status");
    startTransition(async () => {
      try {
        const result = await batchUpdateStatusAction(ids, status);
        if (result.success) {
          toast.success(`${result.data.count} tag státusza módosítva`);
        } else {
          toast.error(result.error);
        }
        resetSelection();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleArchiveConfirm() {
    if (!archiveData) return;
    const { ids, reset } = archiveData;
    setArchiveOpen(false);
    setPendingAction("archive");
    startTransition(async () => {
      try {
        const result = await batchArchiveAction(ids);
        if (result.success) {
          toast.success(`${result.data.count} tag archiválva`);
        } else {
          toast.error(result.error);
        }
        reset();
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={members}
        initialSorting={[{ id: "status", desc: false }]}
        initialColumnVisibility={{
          leadershipRole: false,
          university: false,
          major: false,
        }}
        renderSelectionBar={
          canManage
            ? ({ selectedCount, selectedRows, resetSelection }) => (
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {selectedCount} kijelölve
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                        >
                          {pendingAction === "status" && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Státusz módosítása
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {MEMBERSHIP_STATUSES.map((status) => (
                          <DropdownMenuItem
                            key={status}
                            onClick={() =>
                              handleStatusChange(
                                status,
                                selectedRows,
                                resetSelection,
                              )
                            }
                          >
                            {MEMBERSHIP_STATUS_LABELS[status]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        setArchiveData({
                          ids: selectedRows.map((r) => r.id),
                          count: selectedCount,
                          reset: resetSelection,
                        });
                        setArchiveOpen(true);
                      }}
                    >
                      {pendingAction === "archive" && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Archiválás
                    </Button>
                  </div>
                </div>
              )
            : undefined
        }
      />

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiválás megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              {/* TODO: update when reactivation flow is implemented */}
              Biztosan archiválod a kijelölt {archiveData?.count} tagot? Ez a
              művelet jelenleg NEM visszavonható.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>
              Archiválás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
