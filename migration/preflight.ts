import "dotenv/config";
import { authentikRequest } from "../lib/authentik/client";
import { done, fail, info, step } from "../scripts/utils";

/**
 * Everything the import assumes about the live Authentik instance, checked
 * before any data is touched. The `sub` comparison is the one that matters:
 * `Member.id` is written from `AuthentikUser.uuid` at import time but from the
 * OIDC `sub` claim at login, and Authentik's default subject mode is a *hashed*
 * user id. If those two disagree, every imported member gets a duplicate row on
 * first login and every sync job fails to resolve a pk.
 */

interface AuthentikUser {
  pk: number;
  uuid: string;
  username: string;
  name: string;
  email: string;
  is_active: boolean;
}

interface AuthentikGroup {
  pk: string;
  name: string;
}

interface Paginated<T> {
  pagination: { count: number; total_pages: number };
  results: T[];
}

const GROUP_UUID_VARS = [
  "AUTHENTIK_GROUP_CANDIDATE_CANDIDATE",
  "AUTHENTIK_GROUP_CANDIDATE",
  "AUTHENTIK_GROUP_MEMBER",
  "AUTHENTIK_GROUP_ALUMNI",
  "AUTHENTIK_GROUP_LEADERSHIP_UUID",
];

const GROUP_NAME_VARS = [
  "AUTHENTIK_GROUP_LEADERSHIP",
  "AUTHENTIK_GROUP_ADMIN",
  "AUTHENTIK_GROUP_API_CLIENTS",
];

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) fail("--token is not a JWT (expected three parts).");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return fail("--token payload is not valid JSON.");
  }
}

async function findUser(query: string): Promise<AuthentikUser | null> {
  const data = await authentikRequest<Paginated<AuthentikUser>>(
    `/core/users/?${query}`,
  );
  return data.results[0] ?? null;
}

async function checkSubjectMode(): Promise<boolean> {
  step("Subject mode — does the OIDC `sub` equal the user's UUID?");

  const token = arg("token");
  const claims: Record<string, unknown> = token ? decodeJwtPayload(token) : {};
  const sub = token ? String(claims.sub ?? "") : arg("sub");
  const email = arg("email") ?? (claims.email as string | undefined) ?? null;
  const username =
    (claims.preferred_username as string | undefined) ??
    arg("username") ??
    null;

  if (!sub || (!email && !username)) {
    fail(
      "Need the claims of a real login — reading the UUID out of the Authentik\n" +
        "  admin UI would only compare it with itself.\n\n" +
        "  Run the dev server against the real Authentik, log in, then open\n" +
        "  /api/auth/get-session in the same browser. `user.id` is the sub: the\n" +
        "  user row is keyed on it by databaseHooks.user.create.before.\n\n" +
        "    pnpm tsx migration/preflight.ts --sub <user.id> --email <user.email>\n" +
        "    pnpm tsx migration/preflight.ts --token <id_token>",
    );
  }

  const user = username
    ? await findUser(`username=${encodeURIComponent(username)}`)
    : await findUser(`email=${encodeURIComponent(email as string)}`);

  if (!user) {
    fail(`No Authentik user for ${username ?? email}. Wrong instance?`);
  }

  info(`Authentik user: ${user.username} <${user.email}>`);
  info(`  pk   ${user.pk}`);
  info(`  uuid ${user.uuid}`);
  info(`  sub  ${sub}`);

  if (user.uuid === sub) {
    info("  ✔ sub === uuid — Member.id will match on login.");
    return true;
  }

  console.error(
    "\n  ✖ sub !== uuid.\n" +
      "    The Backstage OIDC provider is not using the UUID as its subject.\n" +
      "    Fix in Authentik: Applications → Providers → <backstage provider>\n" +
      '    → Advanced protocol settings → Subject mode → "Based on the User\'s UUID".\n' +
      "    Existing sessions keep the old sub until they re-authenticate.\n",
  );
  return false;
}

async function checkGroups(): Promise<boolean> {
  step("Group configuration");

  const groups: AuthentikGroup[] = [];
  for (let page = 1; ; page++) {
    const data = await authentikRequest<Paginated<AuthentikGroup>>(
      `/core/groups/?page=${page}&page_size=200`,
    );
    groups.push(...data.results);
    if (page >= data.pagination.total_pages) break;
  }
  info(`${groups.length} groups in Authentik`);

  const byUuid = new Map(groups.map((g) => [g.pk, g]));
  const byName = new Map(groups.map((g) => [g.name, g]));
  let ok = true;

  for (const variable of GROUP_UUID_VARS) {
    const value = process.env[variable];
    if (!value) {
      console.error(`  ✖ ${variable} is not set`);
      ok = false;
      continue;
    }
    const group = byUuid.get(value);
    if (!group) {
      console.error(`  ✖ ${variable}=${value} — no such group`);
      ok = false;
      continue;
    }
    info(`  ✔ ${variable} → "${group.name}"`);
  }

  for (const variable of GROUP_NAME_VARS) {
    const value = process.env[variable];
    if (!value) {
      console.error(`  ✖ ${variable} is not set`);
      ok = false;
      continue;
    }
    if (!byName.has(value)) {
      console.error(`  ✖ ${variable}="${value}" — no group by that name`);
      ok = false;
      continue;
    }
    info(`  ✔ ${variable} → "${value}"`);
  }

  return ok;
}

async function checkWebsite(): Promise<boolean> {
  step("Website credentials");
  const missing = [
    "WEBSITE_URL",
    "WEBSITE_ADMIN_USERNAME",
    "WEBSITE_ADMIN_PASSWORD",
  ].filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`  ✖ missing: ${missing.join(", ")}`);
    return false;
  }
  info("  ✔ set (not verified — the import reads Drupal from a DB dump)");
  return true;
}

async function main(): Promise<void> {
  const results = [
    await checkSubjectMode(),
    await checkGroups(),
    await checkWebsite(),
  ];

  if (results.every(Boolean)) {
    done("Preflight passed.");
  } else {
    fail("Preflight failed. Fix the above before extracting anything.");
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
