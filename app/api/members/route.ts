import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mapServiceError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import { createMember, listMembers } from "@/lib/services/members";
import { requireAuth, requireRole } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const includeArchived = req.nextUrl.searchParams.get("archived") === "true";
  const members = await listMembers(prisma, { includeArchived });

  return NextResponse.json(members);
}

export async function POST(req: NextRequest) {
  const session = await requireRole("ADMIN", "LEADER");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const member = await createMember(prisma, body, {
      id: session.user.id,
      role: session.user.role as "ADMIN" | "LEADER",
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return mapServiceError(error);
  }
}
