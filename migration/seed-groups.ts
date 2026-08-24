import "dotenv/config";
import prisma from "../lib/prisma";
import {
  assertLocalDatabase,
  done,
  fail,
  hasFlag,
  info,
  step,
} from "../scripts/utils";
import type { RawAuthentikGroup } from "./extract-authentik";
import { readJsonIfExists, writeJson } from "./lib/paths";

/**
 * Fills the `AuthentikGroup` registry, which powers the role-assignment
 * checklist.
 *
 * Authentik holds far more groups than a role should offer — status groups,
 * internal ones, whatever else the instance uses — so this does not import them
 * wholesale. The first run writes a selection file listing every group with
 * `include: false`; tick the ones a leadership role should be able to grant and
 * run it again.
 */

const SELECTION_FILE = "group-registry.json";

interface Selection {
  authentikGroupId: string;
  displayName: string;
  include: boolean;
}

async function main(): Promise<void> {
  assertLocalDatabase(hasFlag("--force"));

  const groups = await readJsonIfExists<RawAuthentikGroup[]>(
    "authentik-groups.json",
  );
  if (!groups) {
    fail(
      "No data/authentik-groups.json. Run migration/extract-authentik.ts first.",
    );
  }

  const previous = await readJsonIfExists<Selection[]>(SELECTION_FILE);
  const chosen = new Map(
    (previous ?? []).map((entry) => [entry.authentikGroupId, entry.include]),
  );

  // A group an imported leadership role already grants is a role group by
  // demonstration, so the first run ticks those rather than leaving every box
  // empty and the checklist unusable.
  const referenced = new Set(
    (await prisma.leadershipRole.findMany()).flatMap(
      (role) => role.authentikGroupIds,
    ),
  );

  // Rewritten every run so a group added in Authentik since the last one shows
  // up, while the ticks already made are carried across.
  const selection: Selection[] = groups
    .map((group) => ({
      authentikGroupId: group.pk,
      displayName: group.name,
      include: chosen.get(group.pk) ?? referenced.has(group.pk),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const included = selection.filter((entry) => entry.include);

  step("Groups");
  info(
    `${groups.length} in Authentik, ${included.length} ticked for the registry`,
  );
  if (previous === null) {
    info(await writeJson(SELECTION_FILE, selection));
    done(
      `Set "include": true on the groups a leadership role should be able to ` +
        "grant, then run this again.",
    );
    return;
  }

  info(await writeJson(SELECTION_FILE, selection));
  if (included.length === 0) {
    fail(
      `Nothing ticked in data/${SELECTION_FILE}. The role-assignment checklist ` +
        "would be empty.",
    );
  }

  for (const entry of included) info(`  ${entry.displayName}`);

  step("Writing");
  await prisma.$transaction([
    prisma.authentikGroup.deleteMany(),
    prisma.authentikGroup.createMany({
      data: included.map(({ authentikGroupId, displayName }) => ({
        authentikGroupId,
        displayName,
      })),
    }),
  ]);

  done(`${await prisma.authentikGroup.count()} groups registered.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
