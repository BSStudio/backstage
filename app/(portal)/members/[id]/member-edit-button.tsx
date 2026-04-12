"use client";

import { Archive, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { archiveMemberAction } from "@/lib/actions/members";
import { MemberEditSheet } from "./member-edit-sheet";
import type { AuthentikGroupOption, MemberData, RoleData } from "./types";

export function MemberEditButton({
  member,
  currentRole,
  authentikGroups,
  canChangeStatus,
  canChangeUsername,
  canManageRole,
  canArchive,
}: {
  member: MemberData;
  currentRole: RoleData;
  authentikGroups: AuthentikGroupOption[];
  canChangeStatus: boolean;
  canChangeUsername: boolean;
  canManageRole: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    setArchiveOpen(false);
    startTransition(async () => {
      await archiveMemberAction(member.id);
      router.push("/members");
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Szerkesztés
        </Button>
        {canArchive && !member.archived && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setArchiveOpen(true)}
          >
            <Archive className="mr-2 h-4 w-4" />
            Archiválás
          </Button>
        )}
      </div>

      <MemberEditSheet
        member={member}
        currentRole={currentRole}
        authentikGroups={authentikGroups}
        canChangeStatus={canChangeStatus}
        canChangeUsername={canChangeUsername}
        canManageRole={canManageRole}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiválás megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan archiválod a következő tagot: {member.lastName}{" "}
              {member.firstName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>
              Archiválás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
