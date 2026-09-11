"use client";

import { Upload } from "lucide-react";
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
import { forceWebsiteFullSyncAction } from "@/lib/actions/website";

export function FullSyncButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await forceWebsiteFullSyncAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.count} tag szinkronizálva`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => setOpen(true)}
      >
        <Upload className="mr-2 size-4" />
        Teljes szinkronizálás
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Teljes szinkronizálás</AlertDialogTitle>
            <AlertDialogDescription>
              A módosítások automatikusan eljutnak a honlapra, így erre
              általában nincs szükség. A honlap taglistája a Backstage mostani
              tagjaira cserélődik: aki itt nincs, az onnan is lekerül. Csak
              akkor használd, ha eltérést látsz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Mégse</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                handleConfirm();
              }}
            >
              {isPending ? "Szinkronizálás…" : "Szinkronizálás"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
