import {
  COMPUTER_TONE_STYLE,
  type ComputerGauge,
  computerGauges,
  computerVerdict,
  formatLastSeen,
} from "@/lib/computers";
import type { ComputerView } from "@/lib/services/computers";
import { cn } from "@/lib/utils";

// Neutral rather than branded: on a tinted card a second colour competes with the verdict,
// which is the one thing the card exists to say.
function Gauge({ label, percent }: ComputerGauge) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div aria-hidden className="h-1.5 rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-foreground/35"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function ComputerCard({
  computer,
  action,
}: {
  computer: ComputerView;
  action?: React.ReactNode;
}) {
  const verdict = computerVerdict(computer);
  const tone = COMPUTER_TONE_STYLE[verdict.tone];
  // An offline machine's last readings are not its current ones, and a stale gauge reads as
  // a live one. Only what is still true survives going offline.
  const gauges =
    computer.status === "ONLINE" ? computerGauges(computer.metadata) : [];

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-4 rounded-xl p-4 ring-1",
        tone.surface,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-heading text-xl font-semibold tracking-tight">
            {computer.name}
          </span>
          {computer.metadata.os && (
            <span className="truncate text-xs text-muted-foreground">
              {computer.metadata.os}
            </span>
          )}
        </div>
        <div className="-mt-1 -mr-1 shrink-0">{action}</div>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "font-heading text-2xl leading-none font-semibold tracking-tight",
            tone.text,
          )}
        >
          {verdict.label}
        </span>
        {/* Always a line tall, so the gauges below start at the same height on every card
            whether or not there is somebody to name. */}
        <span className="min-h-5 truncate text-sm text-muted-foreground">
          {verdict.user}
        </span>
      </div>

      {gauges.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {gauges.map((gauge) => (
            <Gauge key={gauge.label} {...gauge} />
          ))}
        </div>
      )}

      <span className="mt-auto text-xs text-muted-foreground">
        Utolsó ping: {formatLastSeen(computer.lastSeenAt)}
      </span>
    </div>
  );
}
