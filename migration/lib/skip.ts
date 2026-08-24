/**
 * Accounts that exist in a source but are not people, so they never become
 * members. Kept in one file because "is this a person" is the same question in
 * both systems, and because anything listed here silently disappears from every
 * count downstream.
 */

/** Drupal `users.uid`. */
export const SKIP_DRUPAL_UIDS = new Map<string, string>([
  ["1", "site administrator account"],
  ["119", "shared studio mailbox"],
]);

/** Authentik `username`. Both carry `type: "internal"`, so the type filter misses them. */
export const SKIP_AUTHENTIK_USERNAMES = new Map<string, string>([
  ["akadmin", "Authentik's built-in administrator"],
  ["test", "test account"],
]);
