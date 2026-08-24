import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { done, fail, info, step } from "../scripts/utils";
import { writeText } from "./lib/paths";

/**
 * Runs the queries in `sql/` through the mysql client inside the website's
 * database container and writes the results to `data/drupal/`.
 *
 * The output is captured and written here rather than shell-redirected: a
 * PowerShell `>` writes UTF-16 or prepends a BOM, and neither survives a TSV
 * parser. `--raw` is deliberately absent — it turns off the escaping that keeps
 * a tab or a newline inside a value from splitting the row.
 */

const QUERIES = [
  "01-profile-fields",
  "02-users",
  "03-profile-values",
  "04-user-roles",
];

interface Connection {
  container: string;
  database: string;
  user: string;
  password: string | null;
  charset: string;
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function connection(): Connection {
  return {
    container:
      arg("container") ??
      process.env.DRUPAL_MYSQL_CONTAINER ??
      "website-mysql-1",
    database: arg("database") ?? process.env.DRUPAL_MYSQL_DATABASE ?? "",
    user: arg("user") ?? process.env.DRUPAL_MYSQL_USER ?? "root",
    password: arg("password") ?? process.env.DRUPAL_MYSQL_PASSWORD ?? null,
    charset: arg("charset") ?? "utf8mb4",
  };
}

function mysql(connection: Connection, sql: string): string {
  const args = ["exec", "-i"];
  // Via the environment rather than -p: a password in argv shows up in the
  // container's process list and in mysql's own warning on stderr.
  if (connection.password) args.push("-e", `MYSQL_PWD=${connection.password}`);
  args.push(
    connection.container,
    "mysql",
    "--batch",
    `--default-character-set=${connection.charset}`,
    "-u",
    connection.user,
  );
  if (connection.database) args.push(connection.database);

  // No `encoding` option: it would be applied to `input` as well, and "buffer"
  // is not a valid string encoding. Buffers in, buffers out, decoded below.
  const result = spawnSync("docker", args, { input: Buffer.from(sql, "utf8") });

  if (result.error) {
    const { message } = result.error as NodeJS.ErrnoException;
    fail(
      `Could not run docker: ${message}\n` +
        "  Is Docker Desktop running and `docker` on PATH?",
    );
  }
  const stderr = result.stderr.toString("utf8").trim();
  if (result.status !== 0) {
    fail(`mysql exited with ${result.status}\n${stderr}`);
  }
  if (stderr) info(`stderr: ${stderr}`);

  return result.stdout.toString("utf8");
}

async function listDatabases(connection: Connection): Promise<void> {
  step(`Databases in ${connection.container}`);
  const output = mysql(
    { ...connection, database: "" },
    "SHOW DATABASES;\nSELECT VERSION() AS version;",
  );
  console.log(output.trim());
  done("Pick one and rerun with --database <name>.");
}

async function main(): Promise<void> {
  const config = connection();

  if (process.argv.includes("--list")) {
    await listDatabases(config);
    return;
  }

  if (!config.database) {
    fail(
      "No database name.\n" +
        "    pnpm tsx migration/extract-drupal.ts --list --password <root password>\n" +
        "  lists what the container holds, then\n" +
        "    pnpm tsx migration/extract-drupal.ts --database <name> --password <root password>",
    );
  }

  step(`Extracting from ${config.database} in ${config.container}`);
  info(
    mysql(
      config,
      "SELECT @@character_set_database AS charset, @@collation_database AS collation;",
    )
      .trim()
      .replace(/\s+/g, " "),
  );

  for (const name of QUERIES) {
    const sql = await readFile(
      join(import.meta.dirname, "sql", `${name}.sql`),
      "utf8",
    );
    const output = mysql(config, sql);
    const rows =
      output.trim() === "" ? 0 : output.trim().split("\n").length - 1;
    if (rows === 0) {
      fail(
        `${name} returned no rows. The queries assume Drupal 6's profile module\n` +
          "  (users, profile_fields, profile_values, users_roles, role). Check the\n" +
          "  table names against this database before continuing.",
      );
    }
    info(
      `${name}: ${rows} rows → ${await writeText(`drupal/${name}.tsv`, output)}`,
    );
  }

  done("Drupal exported. Next: pnpm tsx migration/load-drupal.ts");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
