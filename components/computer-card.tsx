import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  COMPUTER_STATUS_CLASS,
  COMPUTER_STATUS_LABELS,
  computerGauges,
  formatLastSeen,
  formatOccupancy,
} from "@/lib/computers";
import type { ComputerView } from "@/lib/services/computers";

function Gauge({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div aria-hidden className="h-1.5 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
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
  const online = computer.status === "ONLINE";
  const occupancy = formatOccupancy(computer.metadata);
  const gauges = computerGauges(computer.metadata);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-heading font-medium">{computer.name}</span>
            {computer.metadata.os && (
              <span className="truncate text-xs text-muted-foreground">
                {computer.metadata.os}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge className={COMPUTER_STATUS_CLASS[computer.status]}>
              {COMPUTER_STATUS_LABELS[computer.status]}
            </Badge>
            {action}
          </div>
        </div>

        {online && (
          <>
            {occupancy && (
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">Foglaltság</span>
                <span className="truncate">{occupancy}</span>
              </div>
            )}
            {gauges.length > 0 && (
              <div className="flex flex-col gap-2">
                {gauges.map((gauge) => (
                  <Gauge key={gauge.label} {...gauge} />
                ))}
              </div>
            )}
          </>
        )}

        <span className="text-xs text-muted-foreground">
          Utolsó ping: {formatLastSeen(computer.lastSeenAt)}
        </span>
      </CardContent>
    </Card>
  );
}
