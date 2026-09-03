import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLoggedInUser } from "@/lib/computers";
import prisma from "@/lib/prisma";
import { listComputers } from "@/lib/services/computers";

export async function ComputersCard() {
  const computers = await listComputers(prisma);
  if (computers.length === 0) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Számítógépek</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {computers.map((computer) => {
            const online = computer.status === "ONLINE";
            return (
              <li
                key={computer.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                  />
                  <span className="truncate font-medium">{computer.name}</span>
                </span>
                <span className="truncate text-muted-foreground">
                  {online
                    ? (formatLoggedInUser(computer.metadata) ?? "Online")
                    : "Offline"}
                </span>
              </li>
            );
          })}
        </ul>

        <Link
          href="/computers"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Részletek
          <ArrowRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
