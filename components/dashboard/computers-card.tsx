import { Monitor } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMPUTER_TONE_STYLE,
  computerVerdict,
  countFreeComputers,
} from "@/lib/computers";
import prisma from "@/lib/prisma";
import { listComputers } from "@/lib/services/computers";
import { cn } from "@/lib/utils";

export async function ComputersCard() {
  const computers = await listComputers(prisma);
  if (computers.length === 0) return null;

  const free = countFreeComputers(computers);

  return (
    <Card size="sm">
      <CardHeader className="flex items-center gap-2">
        <Monitor className="size-4 text-primary" />
        <CardTitle className="flex-1 text-sm">Számítógépek</CardTitle>
        <span
          className={cn(
            "text-xs font-medium",
            free === 0
              ? "text-muted-foreground"
              : COMPUTER_TONE_STYLE.FREE.text,
          )}
        >
          {free === 0 ? "Nincs szabad" : `${free} szabad`}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* Tiles rather than rows: a row puts the machine and its answer at opposite edges
            of the card, so the two have to be paired by eye. */}
        <div className="grid grid-cols-3 gap-2">
          {computers.map((computer) => {
            const verdict = computerVerdict(computer);
            const tone = COMPUTER_TONE_STYLE[verdict.tone];
            return (
              <div
                key={computer.id}
                className={cn(
                  "flex flex-col gap-0.5 rounded-lg p-2.5 ring-1",
                  tone.surface,
                )}
              >
                <span className="truncate font-heading text-sm font-semibold tracking-tight">
                  {computer.name}
                </span>
                <span className={cn("truncate text-xs font-medium", tone.text)}>
                  {verdict.label}
                </span>
                {verdict.user && (
                  <span className="truncate text-xs text-muted-foreground">
                    {verdict.user}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <Link
          href="/computers"
          className="text-xs text-muted-foreground hover:underline"
        >
          Részletek
        </Link>
      </CardContent>
    </Card>
  );
}
