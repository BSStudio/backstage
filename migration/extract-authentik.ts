import "dotenv/config";
import { authentikRequest } from "../lib/authentik/client";
import { done, info, step } from "../scripts/utils";
import { writeJson } from "./lib/paths";

/**
 * Snapshot of every Authentik user and group.
 *
 * The requests live here rather than in `lib/authentik/*` on purpose: the
 * contract check in `scripts/authentik-contract.ts` guards the endpoints and
 * fields the *application* uses, and a one-off migration reading `page_size`
 * and `type` has no business widening that surface.
 */

export interface RawAuthentikUser {
  pk: number;
  uuid: string;
  username: string;
  name: string;
  email: string;
  is_active: boolean;
  last_login: string | null;
  type: string;
  path: string;
  attributes: Record<string, unknown>;
  groups: string[];
}

export interface RawAuthentikGroup {
  pk: string;
  name: string;
  is_superuser: boolean;
  num_pk: number;
}

interface Paginated<T> {
  pagination: { count: number; total_pages: number };
  results: T[];
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const collected: T[] = [];
  for (let page = 1; ; page++) {
    const data = await authentikRequest<Paginated<T>>(
      `${path}?page=${page}&page_size=200`,
    );
    collected.push(...data.results);
    if (page >= data.pagination.total_pages) break;
  }
  return collected;
}

async function main(): Promise<void> {
  step("Fetching Authentik users");
  const users = await fetchAll<RawAuthentikUser>("/core/users/");
  const humans = users.filter((u) => u.type === "internal");
  info(
    `${users.length} users (${humans.length} internal, rest service accounts)`,
  );
  info(
    `${humans.filter((u) => !u.is_active).length} internal users are inactive`,
  );
  const path = await writeJson("authentik-users.json", users);
  info(path);

  step("Fetching Authentik groups");
  const groups = await fetchAll<RawAuthentikGroup>("/core/groups/");
  info(`${groups.length} groups`);
  info(await writeJson("authentik-groups.json", groups));

  done("Authentik snapshot written.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
