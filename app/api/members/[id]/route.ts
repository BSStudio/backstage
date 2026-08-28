import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mapServiceError } from "@/lib/errors";
import { canManageMembers } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { archiveMember, getMember, updateMember } from "@/lib/services/members";
import { requireAuth, requirePermission } from "@/lib/session";
import type { UserRole } from "@/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const member = await getMember(prisma, id);
    return NextResponse.json(member);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const body = await req.json();
    const { member, syncErrors } = await updateMember(prisma, id, body, {
      id: session.user.id,
      role: session.user.role as UserRole,
    });
    if (syncErrors.length > 0) {
      return NextResponse.json({ member, syncErrors }, { status: 207 });
    }
    return NextResponse.json(member);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requirePermission(canManageMembers);
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const { syncErrors } = await archiveMember(
      prisma,
      id,
      {
        id: session.user.id,
        role: session.user.role as UserRole,
      },
      {
        removeFromGoogleGroup:
          req.nextUrl.searchParams.get("removeFromGoogleGroup") === "true",
      },
    );
    if (syncErrors.length > 0) {
      return NextResponse.json({ archived: true, syncErrors }, { status: 207 });
    }
    return NextResponse.json({ archived: true });
  } catch (error) {
    return mapServiceError(error);
  }
}
