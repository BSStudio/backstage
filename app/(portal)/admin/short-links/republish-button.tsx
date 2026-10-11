"use client";

import { RefreshCw } from "lucide-react";
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
import { republishShortLinksAction } from "@/lib/actions/short-links";
import { toastSync } from "@/lib/toast";

export function RepublishButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function republish() {
    startTransition(async () => {
      const result = await republishShortLinksAction();
      setOpen(false);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { links, removed } = result.data;
      toastSync(
        `${links} link publikálva, ${removed} idegen kulcs törölve`,
        result.syncErrors,
      );
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RefreshCw className="mr-2 size-4" />
        Újrapublikálás
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Újrapublikálás megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Minden link újra kiíródik a Cloudflare tárolójába, és minden olyan
              kulcs törlődik onnan, amit ez a lista nem tartalmaz — azok is,
              amiket nem innen vettek fel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                republish();
              }}
              disabled={isPending}
            >
              Újrapublikálás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
