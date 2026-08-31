import type { Metadata } from "next";
import { AppLinkCard } from "@/components/app-link-card";
import { Card } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import { listAppLinks } from "@/lib/services/app-links";
import { pageActor } from "@/lib/session";

export const metadata: Metadata = { title: "Alkalmazások - Backstage" };

export default async function AppsPage() {
  await pageActor();
  const links = await listAppLinks(prisma);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alkalmazások</h1>
        <p className="text-muted-foreground">A stúdió alkalmazásai.</p>
      </div>

      {links.length === 0 ? (
        <Card className="p-6">
          <p className="text-muted-foreground">
            Nincs még alkalmazás rögzítve.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <AppLinkCard key={link.id} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}
