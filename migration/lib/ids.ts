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

/** Keyed by cluster key (`authentik:<uuid>` / `drupal:<uid>` / `sheet:<tab>:<row>`). */
export type IdAssignments = Record<string, IdAssignment>;

export interface ResolvedId extends IdAssignment {
  /** Set when a cluster that had no account in an earlier run has one now. */
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

export function resolveMemberId(
  assignments: IdAssignments,
  clusterKey: string,
  authentikUuid: string | null,
): ResolvedId {
  const previous = assignments[clusterKey];

  if (authentikUuid) {
    const resolved: ResolvedId = { id: authentikUuid, source: "authentik" };
    // A cluster that was accountless last run and has an account now. Harmless
    // before the cutover, but after it the id has to be rewritten in place —
    // the caller reports it rather than swapping it silently.
    if (previous && previous.id !== authentikUuid) {
      resolved.rewrittenFrom = previous.id;
    }
    assignments[clusterKey] = { id: resolved.id, source: "authentik" };
    return resolved;
  }

  if (previous) {
    if (hasAuthentikAccount(previous.id)) {
      throw new Error(
        `${clusterKey} was assigned the Authentik id ${previous.id} but no ` +
          "Authentik user matched this run. Losing an account silently stops " +
          "the member's sync — resolve the match before continuing.",
      );
    }
    return previous;
  }

  const assignment: IdAssignment = { id: localMemberId(), source: "local" };
  assignments[clusterKey] = assignment;
  return assignment;
}
