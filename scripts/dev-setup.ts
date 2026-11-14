import "dotenv/config";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { databaseUrl, done, fail, hasFlag, info, run, step } from "./utils";
import {
  databaseName,
  mainCheckoutOf,
  setEnvValue,
  staleDatabases,
  WORKTREE_FILES,
  withDatabase,
  worktreeKey,
  worktreeRoots,
} from "./worktree";

const READY_TIMEOUT_MS = 60_000;
const WORKTREE_PREFIX = "backstage_";

async function devSetup(): Promise<void> {
  if (hasFlag("--prune")) {
    await prune();
    return;
  }

  const mainCheckout = mainCheckoutOf(process.cwd());
  if (mainCheckout) copyFromMainCheckout(mainCheckout);

  step("Checking .env");
  if (existsSync(".env")) {
    info(".env exists — leaving it alone.");
  } else {
    await copyFile(".env.example", ".env");
    loadEnv({ path: ".env" });
    info("Created .env from .env.example.");
    info("Authentik values are placeholders — fill them for SSO.");
  }

  let worktreeDatabase: string | null = null;
  if (mainCheckout) {
    worktreeDatabase = databaseName(
      worktreeKey(process.cwd(), mainCheckout),
      WORKTREE_PREFIX,
    );
    pointEnvAt(worktreeDatabase);
  }

  if (hasFlag("--no-docker")) {
    info("Skipping Docker (--no-docker).");
  } else {
    step("Starting Postgres");
    run("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "-d"]);
  }

  step("Waiting for Postgres");
  await waitForPostgres(
    worktreeDatabase ? withDatabase(databaseUrl(), "postgres") : databaseUrl(),
  );
  info("Postgres accepting connections.");

  let seed = true;
  if (worktreeDatabase) {
    step(`Creating ${worktreeDatabase}`);
    seed = await createDatabase(worktreeDatabase);
    info(seed ? "Created." : "Exists — migrating only, not seeding.");
  }

  step("Generating the Prisma client");
  run("pnpm", ["exec", "prisma", "generate"]);

  step("Applying migrations");
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);

  if (seed) run("pnpm", ["exec", "tsx", "scripts/seed-dev.ts"]);

  done("Dev environment ready — start it with: pnpm dev");
}

function copyFromMainCheckout(mainCheckout: string): void {
  step("Copying gitignored files from the main checkout");
  for (const file of WORKTREE_FILES) {
    const source = path.join(mainCheckout, file);
    if (existsSync(file)) {
      info(`${file} exists — leaving it alone.`);
    } else if (existsSync(source)) {
      copyFileSync(source, file);
      info(`Copied ${file}.`);
    } else {
      info(`${file} is not in the main checkout — skipped.`);
    }
  }
}

// Seed and Prisma load dotenv themselves, which never overrides an inherited variable:
// without the process.env write they would run against the main checkout's database.
function pointEnvAt(database: string): void {
  loadEnv({ path: ".env", override: true });
  const url = withDatabase(databaseUrl(), database);
  writeFileSync(
    ".env",
    setEnvValue(readFileSync(".env", "utf8"), "DATABASE_URL", url),
  );
  process.env.DATABASE_URL = url;
  info(`DATABASE_URL points at ${database}.`);
}

async function createDatabase(database: string): Promise<boolean> {
  return withMaintenanceClient(async (client) => {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    if (existing.rowCount) return false;
    // databaseName() leaves only [a-z0-9_], so the quoted identifier needs no escaping.
    await client.query(`CREATE DATABASE "${database}"`);
    return true;
  });
}

async function prune(): Promise<void> {
  step("Dropping the databases of removed worktrees");
  const mainCheckout = mainCheckoutOf(process.cwd()) ?? process.cwd();
  const live = worktreeRoots(process.cwd())
    .filter((root) => path.resolve(root) !== path.resolve(mainCheckout))
    .map((root) =>
      databaseName(worktreeKey(root, mainCheckout), WORKTREE_PREFIX),
    );

  await withMaintenanceClient(async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database",
    );
    const stale = staleDatabases(
      rows.map((row) => row.datname),
      WORKTREE_PREFIX,
      live,
    );
    if (stale.length === 0) info("Nothing to drop.");
    for (const database of stale) {
      try {
        await client.query(`DROP DATABASE "${database}"`);
        info(`Dropped ${database}.`);
      } catch (error) {
        info(`Could not drop ${database}: ${message(error)}`);
      }
    }
  });
  done("Pruned.");
}

async function withMaintenanceClient<T>(
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: withDatabase(databaseUrl(), "postgres"),
  });
  try {
    await client.connect();
  } catch (error) {
    fail(`Postgres is not reachable: ${message(error)}`);
  }
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function waitForPostgres(url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  for (;;) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      await client.end().catch(() => {});
      if (Date.now() > deadline) {
        fail(
          `Postgres did not become reachable within ${READY_TIMEOUT_MS / 1000}s: ${message(error)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// A refused connection arrives as an AggregateError (one attempt per address) with no message of its own.
function message(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return message(error.errors[0]);
  }
  if (error instanceof Error) {
    return error.message || (error as NodeJS.ErrnoException).code || error.name;
  }
  return String(error);
}

devSetup().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
