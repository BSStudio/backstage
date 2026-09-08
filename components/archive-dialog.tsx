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
  const hintId = useId();

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
            {description} Az archiválás később visszavonható.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkboxId}
              checked={removeFromGoogleGroup}
              onCheckedChange={(checked) =>
                setRemoveFromGoogleGroup(checked === true)
              }
              aria-describedby={hintId}
            />
            <Label htmlFor={checkboxId} className="font-normal">
              Törlés a Google Group levelezőlistáról is
            </Label>
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            A listáról való törlést az újraaktiválás nem vonja vissza.
          </p>
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
