"use client";

import { Archive, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { archiveMemberAction } from "@/lib/actions/members";
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
  const [removeFromGoogleGroup, setRemoveFromGoogleGroup] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    setArchiveOpen(false);
    startTransition(async () => {
      const result = await archiveMemberAction(member.id, {
        removeFromGoogleGroup,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.syncErrors && result.syncErrors.length > 0) {
        toast.warning(
          `Tag archiválva, de a szinkronizálás során hiba történt: ${result.syncErrors.join(", ")}`,
        );
      } else {
        toast.success("Tag archiválva");
      }
      router.push("/members");
    });
  }

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
            onClick={() => {
              setRemoveFromGoogleGroup(false);
              setArchiveOpen(true);
            }}
          >
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Archive className="mr-2 size-4" />
            )}
            Archiválás
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

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiválás megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan archiválod a következő tagot: {member.lastName}{" "}
              {member.firstName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="remove-from-google-group"
              checked={removeFromGoogleGroup}
              onCheckedChange={(checked) =>
                setRemoveFromGoogleGroup(checked === true)
              }
            />
            <Label htmlFor="remove-from-google-group" className="font-normal">
              Törlés a Google Group levelezőlistáról is
            </Label>
          </div>
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
