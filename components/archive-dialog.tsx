"use client";

import { useId, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function ArchiveDialog({
  open,
  onOpenChange,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  onConfirm: (removeFromGoogleGroup: boolean) => void;
}) {
  const [removeFromGoogleGroup, setRemoveFromGoogleGroup] = useState(false);
  const checkboxId = useId();

  function handleOpenChange(next: boolean) {
    if (!next) setRemoveFromGoogleGroup(false);
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archiválás megerősítése</AlertDialogTitle>
          <AlertDialogDescription>
            {/* TODO: update when reactivation flow is implemented */}
            {description} Ez a művelet jelenleg NEM visszavonható.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={removeFromGoogleGroup}
            onCheckedChange={(checked) =>
              setRemoveFromGoogleGroup(checked === true)
            }
          />
          <Label htmlFor={checkboxId} className="font-normal">
            Törlés a Google Group levelezőlistáról is
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Mégse</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(removeFromGoogleGroup)}>
            Archiválás
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
