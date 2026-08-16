import "dotenv/config";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { databaseUrl, done, fail, hasFlag, info, run, step } from "./utils";

const READY_TIMEOUT_MS = 60_000;

async function devSetup(): Promise<void> {
  step("Checking .env");
  if (existsSync(".env")) {
    info(".env exists — leaving it alone.");
  } else {
    await copyFile(".env.example", ".env");
    loadEnv({ path: ".env" });
    info("Created .env from .env.example.");
    info("Authentik and website values are placeholders — fill them for SSO.");
  }

  if (hasFlag("--no-docker")) {
    info("Skipping Docker (--no-docker).");
  } else {
    step("Starting Postgres");
    run("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "-d"]);
  }

  step("Waiting for Postgres");
  await waitForPostgres();
  info("Postgres accepting connections.");

  step("Generating the Prisma client");
  run("pnpm", ["exec", "prisma", "generate"]);

  step("Applying migrations");
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);

  run("pnpm", ["exec", "tsx", "scripts/seed-dev.ts"]);

  done("Dev environment ready — start it with: pnpm dev");
}

async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const url = databaseUrl();

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
          `Postgres did not become reachable within ${READY_TIMEOUT_MS / 1000}s: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

devSetup().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
