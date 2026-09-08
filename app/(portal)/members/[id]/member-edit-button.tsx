"use client";

import { Archive, ArchiveRestore, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArchiveDialog } from "@/components/archive-dialog";
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
  archiveMemberAction,
  reactivateMemberAction,
} from "@/lib/actions/members";
import { toastSync } from "@/lib/toast";
import { MEMBERSHIP_STATUS_LABELS } from "@/types";
import { MemberEditSheet } from "./member-edit-sheet";
import type { AuthentikGroupOption, MemberData, RoleData } from "./types";

export function MemberEditButton({
  member,
  currentRole,
  authentikGroups,
  canChangeEmail,
  canChangeStatus,
  canManageRole,
  canArchive,
}: {
  member: MemberData;
  currentRole: RoleData;
  authentikGroups: AuthentikGroupOption[];
  canChangeEmail: boolean;
  canChangeStatus: boolean;
  canManageRole: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive(removeFromGoogleGroup: boolean) {
    setArchiveOpen(false);
    startTransition(async () => {
      const result = await archiveMemberAction(member.id, {
        removeFromGoogleGroup,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toastSync("Tag archiválva", result.syncErrors);
      router.push("/members");
    });
  }

  function handleReactivate() {
    setReactivateOpen(false);
    startTransition(async () => {
      const result = await reactivateMemberAction(member.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toastSync("Tag újraaktiválva", result.syncErrors);
      router.refresh();
    });
  }

  const archiveDescription =
    `Biztosan archiválod a következő tagot: ${member.lastName} ${member.firstName}?` +
    (currentRole ? ` Ezzel megszűnik a pozíciója (${currentRole.label}).` : "");

  const reactivateDescription =
    `Biztosan újraaktiválod a következő tagot: ${member.lastName} ${member.firstName}? ` +
    `${MEMBERSHIP_STATUS_LABELS[member.status]}ként tér vissza, vezetőségi pozíció nélkül.`;

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 size-4" />
          Szerkesztés
        </Button>
        {canArchive && !member.archived && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setArchiveOpen(true)}
          >
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Archive className="mr-2 size-4" />
            )}
            Archiválás
          </Button>
        )}
        {canArchive && member.archived && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setReactivateOpen(true)}
          >
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ArchiveRestore className="mr-2 size-4" />
            )}
            Újraaktiválás
          </Button>
        )}
      </div>

      <MemberEditSheet
        member={member}
        currentRole={currentRole}
        authentikGroups={authentikGroups}
        canChangeEmail={canChangeEmail}
        canChangeStatus={canChangeStatus}
        canManageRole={canManageRole}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        description={archiveDescription}
        onConfirm={handleArchive}
      />

      <AlertDialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Újraaktiválás megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              {reactivateDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivate}>
              Újraaktiválás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
