import { hasAuthentikAccount, localMemberId } from "../../types";
import { readJsonIfExists, writeJson } from "./paths";

/**
 * The only place in the migration that mints a `Member.id`.
 *
 * Reach for `crypto.randomUUID()` anywhere else and the member gets an
 * unprefixed id, which claims an Authentik account they do not have —
 * `hasAuthentikAccount()` then lets every sync job run against a pk that cannot
 * be resolved. `localMemberId()` is the only correct way to make one.
 */

const FILE = "id-assignments.json";

export interface IdAssignment {
  id: string;
  source: "authentik" | "local";
}

/**
 * Keyed by *every* record in the cluster (`authentik:<uuid>` / `drupal:<uid>` /
 * `sheet:<tab>:<row>`), not by the cluster's canonical key.
 *
 * A cluster is not stable: give an alumnus the website account they were
 * missing and the cluster re-keys from `sheet:alumni:44` to `drupal:412`. Keyed
 * canonically, that reads as a brand new person and mints a second id. Keyed by
 * every record, the sheet row still carries the assignment forward.
 */
export type IdAssignments = Record<string, IdAssignment>;

export interface ResolvedId extends IdAssignment {
  /** Set when a cluster that had no Authentik account in an earlier run has one now. */
  rewrittenFrom?: string;
}

export async function loadIdAssignments(): Promise<IdAssignments> {
  return (await readJsonIfExists<IdAssignments>(FILE)) ?? {};
}

export async function saveIdAssignments(
  assignments: IdAssignments,
): Promise<string> {
  return writeJson(FILE, assignments);
}

function previousFor(
  assignments: IdAssignments,
  recordKeys: string[],
): IdAssignment | null {
  const found = new Map<string, IdAssignment>();
  for (const key of recordKeys) {
    const assignment = assignments[key];
    if (assignment) found.set(assignment.id, assignment);
  }

  if (found.size > 1) {
    throw new Error(
      `${recordKeys.join(", ")} carry ${found.size} different member ids from an ` +
        `earlier run (${[...found.keys()].join(", ")}). Two people just merged into ` +
        "one cluster — decide which id survives, or split them in overrides.json.",
    );
  }
  return [...found.values()][0] ?? null;
}

export function resolveMemberId(
  assignments: IdAssignments,
  recordKeys: string[],
  authentikUuid: string | null,
): ResolvedId {
  const previous = previousFor(assignments, recordKeys);

  const remember = (assignment: IdAssignment): void => {
    for (const key of recordKeys) assignments[key] = assignment;
  };

  if (authentikUuid) {
    const assignment: IdAssignment = { id: authentikUuid, source: "authentik" };
    remember(assignment);
    // A cluster that was accountless last run and has an account now. Harmless
    // before the cutover, but after it the id has to be rewritten in place — the
    // caller reports it rather than swapping it silently.
    return previous && previous.id !== authentikUuid
      ? { ...assignment, rewrittenFrom: previous.id }
      : assignment;
  }

  if (previous) {
    if (hasAuthentikAccount(previous.id)) {
      throw new Error(
        `${recordKeys.join(", ")} were assigned the Authentik id ${previous.id} ` +
          "but no Authentik user matched this run. Losing an account silently " +
          "stops the member's sync — resolve the match before continuing.",
      );
    }
    // Re-record it against every key, so a record that joined the cluster since
    // the last run inherits the id too.
    remember(previous);
    return previous;
  }

  const assignment: IdAssignment = { id: localMemberId(), source: "local" };
  remember(assignment);
  return assignment;
}
