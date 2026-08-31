import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { appLinkIcon } from "@/lib/app-links";
import prisma from "@/lib/prisma";
import { listAppLinks } from "@/lib/services/app-links";
import { pageActor } from "@/lib/session";

export const metadata: Metadata = { title: "Kezdőlap - Backstage" };

export default async function DashboardPage() {
  await pageActor();
  const featured = await listAppLinks(prisma, { featuredOnly: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kezdőlap</h1>
        <p className="text-muted-foreground">Üdvözlünk a Backstage-ben.</p>
      </div>

      {featured.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-semibold">Gyakran használt</h2>
            <p className="text-sm text-muted-foreground">
              A többi az{" "}
              <Link href="/apps" className="underline">
                Alkalmazások
              </Link>{" "}
              oldalon.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {featured.map((link) => {
              const Icon = appLinkIcon(link.icon);
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border bg-card py-2 pr-4 pl-3 text-sm font-medium transition-colors hover:border-primary hover:bg-accent"
                >
                  <Icon className="size-4 text-primary" />
                  {link.name}
                </a>
              );
            })}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Hamarosan</CardTitle>
          <CardDescription>
            Ezen az oldalon fogjuk megjeleníteni a naptár eseményeit és a
            számítógépek állapotát.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
