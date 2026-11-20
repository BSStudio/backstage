// Separate from `lib/short-links.ts` because client components import that one, and this
// reads the environment.

export function shortLinkBaseUrl(): string | null {
  return process.env.SHORT_LINK_BASE_URL?.trim().replace(/\/+$/, "") || null;
}
