import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { SEED_GROUPS, type SeedGroupKey } from "./seed-data";
import { fail, info } from "./utils";

export const DEV_GROUPS_FILE = ".dev-authentik-groups.json";

const DevGroupsSchema = z
  .array(
    z.object({
      displayName: z.string().trim().min(1),
      authentikGroupId: z.uuid(),
    }),
  )
  .min(1);

export interface AuthentikGroupRow {
  authentikGroupId: string;
  displayName: string;
}

export interface ResolvedGroups {
  rows: AuthentikGroupRow[];
  idFor(key: SeedGroupKey): string;
}

export async function resolveAuthentikGroups(): Promise<ResolvedGroups> {
  const overrides = await readOverrides();

  const ids = new Map<SeedGroupKey, string>();
  const rows: AuthentikGroupRow[] = [];
  for (const [key, group] of Object.entries(SEED_GROUPS) as [
    SeedGroupKey,
    (typeof SEED_GROUPS)[SeedGroupKey],
  ][]) {
    const id = overrides.get(group.displayName) ?? group.fallbackId;
    overrides.delete(group.displayName);
    ids.set(key, id);
    rows.push({ authentikGroupId: id, displayName: group.displayName });
  }

  // Names the seed roster does not know still land in the registry, so the role-assignment
  // checklist can offer real groups the dev instance has beyond the seeded ones.
  for (const [displayName, authentikGroupId] of overrides) {
    rows.push({ authentikGroupId, displayName });
  }

  return {
    rows,
    idFor: (key) => {
      const id = ids.get(key);
      if (!id) fail(`Unknown seed group key "${key}".`);
      return id;
    },
  };
}

async function readOverrides(): Promise<Map<string, string>> {
  if (!existsSync(DEV_GROUPS_FILE)) {
    info(`No ${DEV_GROUPS_FILE} — seeding invented group UUIDs.`);
    return new Map();
  }

  const parsed = DevGroupsSchema.safeParse(
    JSON.parse(await readFile(DEV_GROUPS_FILE, "utf8")),
  );
  if (!parsed.success) {
    fail(
      `${DEV_GROUPS_FILE} is invalid: ${z.prettifyError(parsed.error)}\n` +
        `  Expected [{ "displayName": "Főszerkesztő", "authentikGroupId": "<uuid>" }, …]`,
    );
  }

  const overrides = new Map(
    parsed.data.map((g) => [g.displayName, g.authentikGroupId]),
  );
  if (overrides.size !== parsed.data.length) {
    fail(`${DEV_GROUPS_FILE} lists the same displayName twice.`);
  }
  info(`${overrides.size} group UUIDs from ${DEV_GROUPS_FILE}.`);
  return overrides;
}
