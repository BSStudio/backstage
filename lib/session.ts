import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, type Session } from "@/lib/auth";
import type { UserRole } from "@/types";

export type { Session };

export async function requireAuth(): Promise<Session | NextResponse> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireRole(
  ...roles: UserRole[]
): Promise<Session | NextResponse> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;
  if (!roles.includes(session.user.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}
