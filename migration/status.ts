import "dotenv/config";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { done, fail, info, step } from "../scripts/utils";
import { dataPath } from "./lib/paths";

/**
 * Which artefacts under `data/` are still true.
 *
 * The pipeline is re-run in pieces over days, so a review file can easily be
 * answering questions the newest export no longer asks. Comparing modification
 * times against the declared inputs is enough to say so, and stops a stale file
 * being read as current.
 */

interface Stage {
  script: string;
  inputs: string[];
  outputs: string[];
  /** Written by hand, or holding human decisions that a delete would destroy. */
  precious?: boolean;
}

const PIPELINE: Stage[] = [
  {
    script: "extract-authentik.ts",
    inputs: [],
    outputs: ["authentik-users.json", "authentik-groups.json"],
  },
  {
    script: "extract-drupal.ts",
    inputs: [],
    outputs: [
      "drupal/01-profile-fields.tsv",
      "drupal/02-users.tsv",
      "drupal/03-profile-values.tsv",
      "drupal/04-user-roles.tsv",
    ],
  },
  {
    script: "load-drupal.ts",
    inputs: [
      "drupal/01-profile-fields.tsv",
      "drupal/02-users.tsv",
      "drupal/03-profile-values.tsv",
      "drupal/04-user-roles.tsv",
    ],
    outputs: ["drupal-users.json"],
  },
  {
    script: "normalize-sheets.ts",
    inputs: ["sheets"],
    outputs: ["sheet-members.json"],
  },
  {
    script: "match.ts",
    inputs: ["authentik-users.json", "drupal-users.json", "sheet-members.json"],
    outputs: ["clusters.json", "match-review.tsv"],
  },
  {
    script: "build-members.ts",
    inputs: [
      "clusters.json",
      "authentik-users.json",
      "drupal-users.json",
      "sheet-members.json",
    ],
    outputs: ["members.json", "rejected.tsv", "id-assignments.json"],
    precious: true,
  },
  {
    script: "inspect-drupal.ts",
    inputs: ["drupal-users.json"],
    outputs: ["drupal-review.tsv"],
    precious: true,
  },
  {
    script: "inspect-clusters.ts",
    inputs: ["clusters.json", "drupal-users.json", "sheet-members.json"],
    outputs: ["cluster-review.tsv"],
    precious: true,
  },
  {
    script: "inspect-names.ts",
    inputs: ["authentik-users.json", "drupal-users.json", "sheet-members.json"],
    outputs: ["name-order-review.tsv"],
    precious: true,
  },
  {
    script: "seed-groups.ts",
    inputs: ["authentik-groups.json"],
    outputs: ["group-registry.json"],
    precious: true,
  },
  {
    script: "export-website-tasks.ts",
    inputs: ["clusters.json", "drupal-users.json", "sheet-members.json"],
    outputs: ["website-fix-status.tsv", "website-create-users.tsv"],
  },
];

// Hand-maintained inputs, and the raw exports the pipeline starts from.
const NOT_GENERATED = new Set([
  "sheets",
  "drupal",
  "overrides.json",
  "member-overrides.json",
]);

/** Newest mtime in a file or anywhere under a directory. */
function newest(path: string): number | null {
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path)
    .map((entry) => newest(`${path}/${entry}`))
    .filter((time): time is number => time !== null)
    .reduce((a, b) => Math.max(a, b), 0);
}

function ago(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function main(): void {
  const clean = process.argv.includes("--clean");
  const declared = new Set<string>();
  const stale: { stage: Stage; output: string; behind: string }[] = [];
  const missing: { stage: Stage; output: string }[] = [];

  step("Pipeline");
  for (const stage of PIPELINE) {
    for (const output of stage.outputs) declared.add(output);

    const inputTimes = stage.inputs
      .map((input) => ({ input, time: newest(dataPath(input)) }))
      .filter(
        (entry): entry is { input: string; time: number } =>
          entry.time !== null,
      );

    const lines: string[] = [];
    for (const output of stage.outputs) {
      const time = newest(dataPath(output));
      if (time === null) {
        missing.push({ stage, output });
        lines.push(`missing   ${output}`);
        continue;
      }
      const behind = inputTimes.filter((entry) => entry.time > time);
      if (behind.length > 0) {
        stale.push({
          stage,
          output,
          behind: behind.map((entry) => entry.input).join(", "),
        });
        lines.push(
          `STALE     ${output.padEnd(26)} older than ${behind.map((e) => e.input).join(", ")}`,
        );
      } else {
        lines.push(`ok        ${output.padEnd(26)} ${ago(time)}`);
      }
    }
    info(stage.script);
    for (const line of lines) info(`  ${line}`);
  }

  step("Not produced by any stage");
  const orphans: string[] = [];
  const walk = (directory: string, prefix = ""): void => {
    for (const entry of readdirSync(directory)) {
      const key = prefix ? `${prefix}/${entry}` : entry;
      if (NOT_GENERATED.has(key) || declared.has(key)) continue;
      if (statSync(`${directory}/${entry}`).isDirectory()) {
        walk(`${directory}/${entry}`, key);
        continue;
      }
      orphans.push(key);
    }
  };
  walk(dataPath());
  if (orphans.length === 0) info("none");
  for (const orphan of orphans) info(`  ${orphan}`);

  step("Summary");
  info(
    `${stale.length} stale, ${missing.length} missing, ${orphans.length} orphaned`,
  );

  if (clean) {
    for (const orphan of orphans) {
      unlinkSync(dataPath(orphan));
      info(`deleted ${orphan}`);
    }
    const disposable = stale.filter(({ stage }) => !stage.precious);
    for (const { output } of disposable) {
      unlinkSync(dataPath(output));
      info(`deleted ${output}`);
    }
    const kept = stale.filter(({ stage }) => stage.precious);
    for (const { output, stage } of kept) {
      info(
        `kept ${output} — holds decisions; rerun ${stage.script} to refresh it`,
      );
    }
    done("Cleaned. Rerun the stages listed above.");
    return;
  }

  if (stale.length > 0 || orphans.length > 0) {
    const scripts = [...new Set(stale.map(({ stage }) => stage.script))];
    info("");
    info("Refresh with:");
    for (const script of scripts) info(`  pnpm tsx migration/${script}`);
    if (orphans.length > 0) {
      info("Delete the orphans with: pnpm tsx migration/status.ts --clean");
    }
  }

  done(
    stale.length === 0 && orphans.length === 0
      ? "Everything under data/ is current."
      : `${stale.length + orphans.length} files need attention.`,
  );
}

try {
  main();
} catch (error: unknown) {
  fail(error instanceof Error ? error.message : String(error));
}
