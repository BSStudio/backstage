import { MonitorDown } from "lucide-react";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/auto-refresh";
import { ComputerCard } from "@/components/computer-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COMPUTER_REFRESH_MS } from "@/lib/computers";
import { canAdminister } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { isRdpConfigured } from "@/lib/rdp";
import { listComputers } from "@/lib/services/computers";
import { pageActor } from "@/lib/session";
import { DeleteComputerButton } from "./delete-computer-button";

export const metadata: Metadata = { title: "Számítógépek - Backstage" };

export default async function ComputersPage() {
  const actor = await pageActor();
  const computers = await listComputers(prisma);
  const canManage = canAdminister(actor.role);
  const canConnect = isRdpConfigured();

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={COMPUTER_REFRESH_MS} />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Számítógépek</h1>
        <p className="text-muted-foreground">
          A vágógépek állapota, ahogy a rajtuk futó agent jelenti.
        </p>
      </div>

      {computers.length === 0 ? (
        <Card className="p-6">
          <p className="text-muted-foreground">
            Egyik gépről sem érkezett még ping.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {computers.map((computer) => (
            <ComputerCard
              key={computer.id}
              computer={computer}
              action={
                <div className="flex items-center">
                  {canConnect && (
                    <Button asChild variant="ghost" size="icon">
                      <a
                        href={`/api/computers/${computer.id}/rdp`}
                        aria-label={`${computer.name} – RDP-fájl letöltése`}
                        title="RDP-fájl letöltése"
                      >
                        <MonitorDown className="size-4" />
                      </a>
                    </Button>
                  )}
                  {canManage && (
                    <DeleteComputerButton
                      id={computer.id}
                      name={computer.name}
                    />
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
