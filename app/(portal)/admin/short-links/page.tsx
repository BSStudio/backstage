import type { Metadata } from "next";
import { isCloudflareConfigured } from "@/lib/cloudflare/client";
import {
  canAdminister,
  canManageShortLinks,
  canViewAdminArea,
} from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { getShortLinkClicks, listShortLinks } from "@/lib/services/short-links";
import { pageActor } from "@/lib/session";
import { shortLinkBaseUrl, shortLinkHost } from "@/lib/short-link-config";
import { ShortLinksTable } from "./short-links-table";

export const metadata: Metadata = {
  title: "Rövid linkek kezelése - Backstage",
};

export default async function AdminShortLinksPage() {
  const actor = await pageActor(canViewAdminArea);
  const [links, clicks] = await Promise.all([
    listShortLinks(prisma, actor),
    getShortLinkClicks(actor),
  ]);

  const baseUrl = shortLinkBaseUrl();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Rövid linkek kezelése
        </h1>
        <p className="text-muted-foreground">
          {baseUrl
            ? `A linkek a ${baseUrl} címen válaszolnak.`
            : "Nincs beállítva rövid domain, ezért a linkek nem élnek."}
        </p>
      </div>

      <ShortLinksTable
        links={links}
        clicks={clicks}
        baseUrl={baseUrl}
        shortHost={shortLinkHost()}
        canManage={canManageShortLinks(actor.role)}
        canRepublish={canAdminister(actor.role) && isCloudflareConfigured()}
      />
    </div>
  );
}
