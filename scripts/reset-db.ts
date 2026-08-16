import "dotenv/config";
import { assertLocalDatabase, done, hasFlag, run, step } from "./utils";

const force = hasFlag("--force");
assertLocalDatabase(force);

step("Dropping and re-migrating the database");
run("pnpm", ["exec", "prisma", "migrate", "reset", "--force"]);

if (hasFlag("--skip-seed")) {
  done("Database reset. Seed with: pnpm db:seed");
} else {
  const forwarded = ["--force", "--reset-user"].filter(hasFlag);
  run("pnpm", ["exec", "tsx", "scripts/seed-dev.ts", ...forwarded]);
}
