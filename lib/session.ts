import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth, type Session } from "@/lib/auth";
import { type Actor, toActor } from "@/lib/permissions";
import type { UserRole } from "@/types";

export type { Session };

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireAuth(): Promise<Session | NextResponse> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

// Takes a predicate from `lib/permissions` rather than a role list so a route cannot state a
// policy of its own. Services guard themselves too; this only fails the request before it
// parses a body or touches the database.
export async function requirePermission(
  allows: (role: UserRole | undefined) => boolean,
): Promise<Session | NextResponse> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;
  if (!allows(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

// A Server Action answers with a result object rather than a response, so it takes the
// actor instead of the session; the predicate comes from `lib/permissions` all the same.
export async function sessionActor(): Promise<Actor | null> {
  const session = await getSession();
  return session ? toActor(session) : null;
}

export async function permittedActor(
  allows: (role: UserRole | undefined) => boolean,
): Promise<Actor | null> {
  const actor = await sessionActor();
  return actor && allows(actor.role) ? actor : null;
}

// A page has nowhere to put a 401, so it sends the visitor home instead. This is the UX:
// what keeps restricted data safe is the service refusing the actor.
export async function pageActor(
  allows?: (role: UserRole | undefined) => boolean,
): Promise<Actor> {
  const actor = await sessionActor();
  if (!actor || (allows && !allows(actor.role))) redirect("/");
  return actor;
}
