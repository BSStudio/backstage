import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { syncJson, syncJsonResource } from "@/lib/api-response";
import { mapServiceError } from "@/lib/errors";
import { canManageMembers, toActor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { archiveMember, getMember, updateMember } from "@/lib/services/members";
import { requireAuth, requirePermission } from "@/lib/session";

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
    const { member, syncErrors } = await updateMember(
      prisma,
      id,
      body,
      toActor(session),
    );
    return syncJsonResource("member", member, syncErrors);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requirePermission(canManageMembers);
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const { syncErrors } = await archiveMember(prisma, id, toActor(session), {
      removeFromGoogleGroup:
        req.nextUrl.searchParams.get("removeFromGoogleGroup") === "true",
    });
    return syncJson({ archived: true }, syncErrors);
  } catch (error) {
    return mapServiceError(error);
  }
}
