import { spawnSync } from "node:child_process";

export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function step(message: string): void {
  console.log(`\n▸ ${message}`);
}

export function info(message: string): void {
  console.log(`  ${message}`);
}

export function done(message: string): void {
  console.log(`\n✔ ${message}\n`);
}

// shell: true because pnpm/docker are .cmd shims on Windows and spawn cannot exec those directly.
// The command is pre-joined rather than passed as an args array — that combination is deprecated
// (DEP0190) since the shell would concatenate them anyway.
export function run(command: string, args: string[]): void {
  const result = spawnSync([command, ...args].join(" "), {
    stdio: "inherit",
    shell: true,
  });
  if (result.error) fail(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
}

export function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set — copy .env.example to .env first.");
  return url;
}

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "db",
  "postgres",
]);

export function assertLocalDatabase(force: boolean): void {
  const { hostname } = new URL(databaseUrl());
  if (force || LOCAL_HOSTS.has(hostname)) return;
  fail(
    `Refusing to wipe a database on "${hostname}" — this only ever runs against a local dev database.\n` +
      "  Pass --force if you are certain.",
  );
}
