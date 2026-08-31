import type { Metadata } from "next";
import { canAdminister, canViewAdminArea } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { listAppLinks } from "@/lib/services/app-links";
import { pageActor } from "@/lib/session";
import { AppsTable } from "./apps-table";

export const metadata: Metadata = {
  title: "Alkalmazások kezelése - Backstage",
};

export default async function AdminAppsPage() {
  const actor = await pageActor(canViewAdminArea);
  const links = await listAppLinks(prisma);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Alkalmazások kezelése
        </h1>
        <p className="text-muted-foreground">
          Ebben a sorrendben jelennek meg az Alkalmazások oldalon.
        </p>
      </div>

      <AppsTable links={links} canManage={canAdminister(actor.role)} />
    </div>
  );
}
