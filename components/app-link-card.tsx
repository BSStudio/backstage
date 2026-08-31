import { ExternalLink } from "lucide-react";
import type { AppLink } from "@/app/generated/prisma/client";
import { APP_LINK_TILE_CLASS, appLinkHost, appLinkIcon } from "@/lib/app-links";
import { cn } from "@/lib/utils";

// A row rather than a tile: the host stays readable without hovering, which is what tells
// two similarly named apps apart.
export function AppLinkCard({ link }: { link: AppLink }) {
  const Icon = appLinkIcon(link.icon);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          APP_LINK_TILE_CLASS[link.accent],
        )}
      >
        <Icon className="size-5" />
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="font-semibold leading-tight">{link.name}</span>
        {link.description && (
          <span className="truncate text-sm text-muted-foreground">
            {link.description}
          </span>
        )}
        <span className="truncate font-mono text-xs text-muted-foreground/85">
          {appLinkHost(link.url)}
        </span>
      </span>

      <ExternalLink className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}
