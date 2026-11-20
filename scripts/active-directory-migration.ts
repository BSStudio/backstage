import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { Client, EqualityFilter, NoSuchObjectError, OrFilter } from "ldapts";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  activeDirectoryConfig,
  memberDistinguishedName,
} from "../lib/active-directory/config";
import { authentikRequest } from "../lib/authentik/client";
import { type AuthentikUser, updateUser } from "../lib/authentik/users";
import { EXTERNAL_REQUEST_TIMEOUT_MS } from "../lib/http";
import {
  buildDirectoryUser,
  generateInitialPassword,
} from "../lib/sync/active-directory/attributes";
import { hasAuthentikAccount } from "../types";
import { done, fail, info, step } from "./utils";

const USAGE = `Usage: pnpm tsx scripts/active-directory-migration.ts <check|plan|run> --env <path> [--yes]

  check  connect to the dump, Authentik and AD; write nothing
  plan   report what run would do for every member; write nothing
  run    create the missing AD accounts and set the DN on their Authentik users

The env file needs DUMP_DATABASE_URL, AUTHENTIK_URL, AUTHENTIK_API_TOKEN and the AD_* settings
from .env.example, plus AD_LDAP_TLS_SERVERNAME when AD_LDAP_URL goes through a tunnel.`;

const SAM_ACCOUNT_NAME_MAX = 20;

type Phase = "check" | "plan" | "run";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  archived: boolean;
}

interface Outcome {
  status: "created" | "present" | "skipped" | "failed";
  detail: string;
}

function settings() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      env: { type: "string" },
      yes: { type: "boolean", default: false },
    },
  });
  const phase = positionals[0] ?? "";
  const envFile = values.env;
  if (!["check", "plan", "run"].includes(phase) || !envFile) fail(USAGE);

  // Wins over the shell, which may still carry the dev instance's values.
  const { error } = loadEnv({ path: envFile, override: true, quiet: true });
  if (error) fail(`Cannot read ${envFile}: ${error.message}`);
  const databaseUrl = process.env.DUMP_DATABASE_URL;
  if (!databaseUrl) fail(`DUMP_DATABASE_URL is not set in ${envFile}`);

  return { phase: phase as Phase, yes: values.yes, databaseUrl };
}

async function openDirectory(): Promise<Client> {
  const { url, bindDn, bindPassword, tlsOptions } = activeDirectoryConfig();
  // Through a tunnel the URL names a local port, while the certificate names the DC.
  const servername = process.env.AD_LDAP_TLS_SERVERNAME;
  const client = new Client({
    url,
    timeout: EXTERNAL_REQUEST_TIMEOUT_MS,
    connectTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
    tlsOptions: servername ? { ...tlsOptions, servername } : tlsOptions,
  });
  await client.bind(bindDn, bindPassword);
  return client;
}

function tlsMode(): string {
  const { tlsOptions } = activeDirectoryConfig();
  const name = process.env.AD_LDAP_TLS_SERVERNAME;
  if (tlsOptions.rejectUnauthorized === false) return "verification off";
  const trust = tlsOptions.ca ? "pinned certificate" : "system trust store";
  return name ? `${trust}, checked against ${name}` : trust;
}

async function entryExists(client: Client, dn: string): Promise<boolean> {
  try {
    const { searchEntries } = await client.search(dn, {
      scope: "base",
      attributes: ["dn"],
    });
    return searchEntries.length > 0;
  } catch (error) {
    if (error instanceof NoSuchObjectError) return false;
    throw error;
  }
}

function sameDn(a: string, b: string): boolean {
  const normalise = (dn: string) => dn.replace(/,\s+/g, ",").toLowerCase();
  return normalise(a) === normalise(b);
}

// sAMAccountName and userPrincipalName are unique across the domain, not just the OU.
async function accountsHoldingName(
  client: Client,
  username: string,
  upn: string,
  dn: string,
): Promise<string[]> {
  const domainRoot = activeDirectoryConfig()
    .usersOu.split(",")
    .filter((part) => /^\s*DC=/i.test(part))
    .join(",");
  const { searchEntries } = await client.search(domainRoot, {
    scope: "sub",
    filter: new OrFilter({
      filters: [
        new EqualityFilter({ attribute: "sAMAccountName", value: username }),
        new EqualityFilter({ attribute: "userPrincipalName", value: upn }),
      ],
    }),
    attributes: ["dn"],
  });
  return searchEntries
    .map((entry) => entry.dn)
    .filter((found) => !sameDn(found, dn));
}

async function findAuthentikUser(id: string): Promise<AuthentikUser | null> {
  const { results } = await authentikRequest<{ results: AuthentikUser[] }>(
    `/core/users/?uuid=${encodeURIComponent(id)}`,
  );
  return results[0] ?? null;
}

async function migrateMember(
  client: Client,
  member: Member,
  apply: boolean,
): Promise<Outcome> {
  const user = await findAuthentikUser(member.id);
  if (!user) return { status: "skipped", detail: "no Authentik user" };
  if (user.username.length > SAM_ACCOUNT_NAME_MAX) {
    return {
      status: "failed",
      detail: `username ${user.username} is over ${SAM_ACCOUNT_NAME_MAX} characters`,
    };
  }

  const { upnSuffix } = activeDirectoryConfig();
  const dn = memberDistinguishedName(member.id);
  // Either side saying archived wins: the dump may be older than the last archive.
  const disabled = member.archived || !user.is_active;
  const notes = [user.username, disabled ? "disabled" : "enabled"];
  if (member.archived === user.is_active) {
    notes.push(
      `dump says ${member.archived ? "archived" : "active"}, Authentik says ${user.is_active ? "active" : "inactive"}`,
    );
  }

  const present = await entryExists(client, dn);
  if (!present) {
    const holders = await accountsHoldingName(
      client,
      user.username,
      `${user.username}@${upnSuffix}`,
      dn,
    );
    if (holders.length > 0) {
      return {
        status: "failed",
        detail: `${user.username} is already held by ${holders.join("; ")}`,
      };
    }
    if (apply) {
      await client.add(
        dn,
        buildDirectoryUser(
          { ...member, archived: disabled },
          user.username,
          upnSuffix,
          generateInitialPassword(),
        ),
      );
    }
  }

  if (user.attributes.distinguishedName !== dn) {
    if (apply) {
      // Authentik replaces the attribute set wholesale.
      await updateUser(user.pk, {
        attributes: { ...user.attributes, distinguishedName: dn },
      });
    }
    notes.push(apply ? "DN set" : "DN to set");
  }

  if (present) return { status: "present", detail: notes.join(", ") };
  return {
    status: "created",
    detail: (apply ? notes : ["would create", ...notes]).join(", "),
  };
}

async function readMembers(databaseUrl: string): Promise<Member[]> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const members = await prisma.member.findMany({
      select: { id: true, firstName: true, lastName: true, archived: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return members.filter((member) => hasAuthentikAccount(member.id));
  } finally {
    await prisma.$disconnect();
  }
}

function describeTargets(databaseUrl: string) {
  const { url, usersOu } = activeDirectoryConfig();
  const { host, pathname } = new URL(databaseUrl);
  info(`Dump:      ${host}${pathname}`);
  info(`Authentik: ${process.env.AUTHENTIK_URL ?? "(not set)"}`);
  info(`AD:        ${url} (${tlsMode()})`);
  info(`OU:        ${usersOu}`);
}

async function check(databaseUrl: string) {
  step("Targets");
  describeTargets(databaseUrl);

  const failures: string[] = [];
  const attempt = async (name: string, probe: () => Promise<string>) => {
    step(name);
    try {
      info(await probe());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      info(`✖ ${message}`);
      failures.push(name);
    }
  };

  await attempt("Dump", async () => {
    const members = await readMembers(databaseUrl);
    return `${members.length} member(s) with an Authentik account`;
  });
  await attempt("Authentik", async () => {
    const { pagination } = await authentikRequest<{
      pagination: { count: number };
    }>("/core/users/?page_size=1");
    return `${pagination.count} user(s) visible to the token`;
  });
  await attempt("Active Directory", async () => {
    const client = await openDirectory();
    try {
      const { usersOu } = activeDirectoryConfig();
      if (!(await entryExists(client, usersOu))) {
        throw new Error(`Bound, but ${usersOu} does not exist`);
      }
      return `Bound and found ${usersOu}`;
    } finally {
      await client.unbind().catch(() => {});
    }
  });

  if (failures.length > 0) fail(`Failed: ${failures.join(", ")}`);
  done("Every connection works");
}

async function confirm(count: number): Promise<boolean> {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await prompt.question(
    `\nThis writes to AD and Authentik for ${count} member(s). Type "run" to continue: `,
  );
  prompt.close();
  return answer.trim() === "run";
}

async function migrate(databaseUrl: string, apply: boolean, yes: boolean) {
  step("Targets");
  describeTargets(databaseUrl);

  const members = await readMembers(databaseUrl);
  if (apply && !yes && !(await confirm(members.length))) fail("Cancelled");

  step(`${apply ? "Migrating" : "Planning"} ${members.length} member(s)`);
  const client = await openDirectory();
  const outcomes: { member: Member; outcome: Outcome }[] = [];
  try {
    for (const member of members) {
      const outcome = await migrateMember(client, member, apply).catch(
        (error): Outcome => ({
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
      outcomes.push({ member, outcome });
      info(
        `${outcome.status.padEnd(8)} ${member.lastName} ${member.firstName}  ${outcome.detail}`,
      );
    }
  } finally {
    await client.unbind().catch(() => {});
  }

  step("Summary");
  for (const status of ["created", "present", "skipped", "failed"] as const) {
    const count = outcomes.filter((o) => o.outcome.status === status).length;
    info(`${status.padEnd(8)} ${count}`);
  }
  const failed = outcomes.filter((o) => o.outcome.status === "failed");
  if (failed.length > 0) {
    step(
      "Failed — these members cannot set an Authentik password once the app sends their DN",
    );
    for (const { member, outcome } of failed) {
      info(
        `${member.lastName} ${member.firstName} (${member.id}): ${outcome.detail}`,
      );
    }
    fail(`${failed.length} member(s) failed`);
  }
  done(apply ? "Migration finished" : "Plan finished; nothing was written");
}

async function main() {
  const { phase, yes, databaseUrl } = settings();
  if (phase === "check") return check(databaseUrl);
  return migrate(databaseUrl, phase === "run", yes);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
