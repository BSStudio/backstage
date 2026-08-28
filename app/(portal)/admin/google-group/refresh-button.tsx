"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshGoogleGroupAction } from "@/lib/actions/google-group";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await refreshGoogleGroupAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.count} cím beolvasva`);
      router.refresh();
    });
  }

  return (
    <Button disabled={isPending} onClick={handleClick}>
      <RefreshCw className={`mr-2 size-4 ${isPending ? "animate-spin" : ""}`} />
      Lista frissítése
    </Button>
  );
}
