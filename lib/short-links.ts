export function shortLinkUrl(base: string | null, slug: string): string {
  return base ? `${base}/${slug}` : `/${slug}`;
}

export const PUBLISH_STATES = ["UNPUBLISHED", "STALE", "PUBLISHED"] as const;

export type PublishState = (typeof PUBLISH_STATES)[number];

export function publishState(link: {
  updatedAt: Date;
  publishedAt: Date | null;
}): PublishState {
  if (!link.publishedAt) return "UNPUBLISHED";
  if (link.publishedAt < link.updatedAt) return "STALE";
  return "PUBLISHED";
}

export const PUBLISH_STATE_LABELS: Record<PublishState, string> = {
  UNPUBLISHED: "Nincs publikálva",
  STALE: "Elavult",
  PUBLISHED: "Publikálva",
};

export const PUBLISH_STATE_BADGE_CLASS: Record<PublishState, string> = {
  UNPUBLISHED: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  STALE: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  PUBLISHED: "bg-green-500/15 text-green-600 dark:text-green-400",
};
