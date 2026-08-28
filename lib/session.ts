import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, type Session } from "@/lib/auth";
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
  if (!allows(session.user.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}
