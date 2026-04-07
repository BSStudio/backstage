import { CircleSlash } from "lucide-react";
import { parseAuditDiff } from "@/lib/members";

function EmptyValue() {
  return (
    <span className="inline-flex items-center align-middle text-muted-foreground/70">
      <CircleSlash className="h-3.5 w-3.5" />
    </span>
  );
}

function DiffValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <EmptyValue />;
  return <span>{String(value)}</span>;
}

export function AuditDiff({ diff }: { diff: unknown }) {
  const parsed = parseAuditDiff(diff);

  if (parsed === null) return <span className="text-muted-foreground">—</span>;
  if (parsed === "created") return <span>Új tag</span>;

  return (
    <div className="flex flex-col gap-0.5">
      {parsed.map((entry) => (
        <div key={entry.field} className="text-sm">
          <span className="font-medium">{entry.field}</span>
          {": "}
          <DiffValue value={entry.old} />
          <span className="mx-1 text-muted-foreground">→</span>
          <DiffValue value={entry.new} />
        </div>
      ))}
    </div>
  );
}
