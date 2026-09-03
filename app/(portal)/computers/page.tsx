import type { Metadata } from "next";
import { ComputerCard } from "@/components/computer-card";
import { Card } from "@/components/ui/card";
import { canAdminister } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { listComputers } from "@/lib/services/computers";
import { pageActor } from "@/lib/session";
import { DeleteComputerButton } from "./delete-computer-button";

export const metadata: Metadata = { title: "Számítógépek - Backstage" };

export default async function ComputersPage() {
  const actor = await pageActor();
  const computers = await listComputers(prisma);
  const canManage = canAdminister(actor.role);

  return (
    <div className="flex flex-col gap-6">
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {computers.map((computer) => (
            <ComputerCard
              key={computer.id}
              computer={computer}
              action={
                canManage && (
                  <DeleteComputerButton id={computer.id} name={computer.name} />
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
