import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { syncJsonResource } from "@/lib/api-response";
import { mapServiceError } from "@/lib/errors";
import { canManageMembers, toActor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { createMember, listMembers } from "@/lib/services/members";
import { requireAuth, requirePermission } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const includeArchived = req.nextUrl.searchParams.get("archived") === "true";
  const members = await listMembers(prisma, { includeArchived });

  return NextResponse.json(members);
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(canManageMembers);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const { member, syncErrors } = await createMember(
      prisma,
      body,
      toActor(session),
    );
    return syncJsonResource("member", member, syncErrors, { status: 201 });
  } catch (error) {
    return mapServiceError(error);
  }
}
