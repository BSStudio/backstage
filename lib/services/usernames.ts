import { findAvailableUsername } from "@/lib/authentik/users";
import { deriveUsername } from "@/types";

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;

const cache = new Map<string, { username: string; expiresAt: number }>();

export async function resolveAvailableUsername(
  firstName: string,
  lastName: string,
): Promise<string> {
  return findAvailableUsername(deriveUsername(firstName, lastName));
}

export async function suggestUsername(
  firstName: string,
  lastName: string,
): Promise<string> {
  const key = deriveUsername(firstName, lastName);
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.username;

  const username = await resolveAvailableUsername(firstName, lastName);

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
  cache.set(key, { username, expiresAt: now + CACHE_TTL_MS });

  return username;
}
