"use client";

import { Archive, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArchiveDialog } from "@/components/archive-dialog";
import { Button } from "@/components/ui/button";
import { archiveMemberAction } from "@/lib/actions/members";
import { toastSync } from "@/lib/toast";
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
        description={`Biztosan archiválod a következő tagot: ${member.lastName} ${member.firstName}?`}
        onConfirm={handleArchive}
      />
    </>
  );
}
