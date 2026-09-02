import { Monitor } from "lucide-react";

export function ComputersCard() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <Monitor className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">Számítógépek állapota</span>
      <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">
        Hamarosan
      </span>
    </div>
  );
}
