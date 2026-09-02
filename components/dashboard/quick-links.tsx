import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appLinkIcon } from "@/lib/app-links";
import prisma from "@/lib/prisma";
import { listAppLinks } from "@/lib/services/app-links";

export async function QuickLinks() {
  const links = await listAppLinks(prisma, { featuredOnly: true });
  if (links.length === 0) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Gyors elérés</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {links.map((link) => {
            const Icon = appLinkIcon(link.icon);
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border bg-card py-1.5 pr-3.5 pl-2.5 text-xs font-medium transition-colors hover:border-primary hover:bg-accent"
              >
                <Icon className="size-3.5 text-primary" />
                {link.name}
              </a>
            );
          })}
        </div>

        <Link
          href="/apps"
          className="text-xs text-muted-foreground hover:underline"
        >
          Az összes alkalmazás
        </Link>
      </CardContent>
    </Card>
  );
}
