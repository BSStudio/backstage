"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retrySyncJobAction } from "@/lib/actions/sync-jobs";

export function RetryButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await retrySyncJobAction(jobId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.syncSuccess) {
        toast.success("Szinkronizáció sikeres");
      } else {
        toast.warning(`Szinkronizáció sikertelen: ${result.data.syncError}`);
      }
      router.refresh();
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
    >
      <RefreshCw className={`mr-2 size-4 ${isPending ? "animate-spin" : ""}`} />
      Újrapróbálás
    </Button>
  );
}
