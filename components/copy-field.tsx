"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Nem sikerült a vágólapra másolni");
      return;
    }
    setCopied(true);
    toast.success("Vágólapra másolva");
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-sm">
          {value}
        </code>
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          <span className="sr-only">Másolás</span>
        </Button>
      </div>
    </div>
  );
}
