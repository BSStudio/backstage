"use client";

import { MonitorDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Fetched rather than followed as a plain link: an anchor navigates away from the portal and
// renders whatever the route answered, so a machine deleted since the page rendered would
// replace the page with the route's JSON body.
export function RdpDownloadButton({ id, name }: { id: string; name: string }) {
  const [isPending, setIsPending] = useState(false);

  async function download() {
    setIsPending(true);
    try {
      const response = await fetch(`/api/computers/${id}/rdp`);
      if (!response.ok) throw new Error(String(response.status));

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.rdp`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`A(z) ${name} RDP-fájlja nem tölthető le.`);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${name} – RDP-fájl letöltése`}
      title="RDP-fájl letöltése"
      disabled={isPending}
      onClick={download}
    >
      <MonitorDown className="size-4" />
    </Button>
  );
}
