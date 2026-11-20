export const CLICK_WINDOW_DAYS = 30;

export function shortLinkUrl(base: string, slug: string): string {
  return `${base}/${slug}`;
}

export function shortLinkPrefix(base: string): string {
  return `${base.replace(/^https?:\/\//, "")}/`;
}

export const PUBLISH_STATES = ["UNPUBLISHED", "STALE", "PUBLISHED"] as const;

export type PublishState = (typeof PUBLISH_STATES)[number];

export function publishState(link: {
  url: string;
  publishedUrl: string | null;
}): PublishState {
  if (link.publishedUrl === null) return "UNPUBLISHED";
  if (link.publishedUrl !== link.url) return "STALE";
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
