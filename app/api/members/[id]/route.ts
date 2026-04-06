import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mapServiceError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import { archiveMember, getMember, updateMember } from "@/lib/services/members";
import { requireAuth, requireRole } from "@/lib/session";

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
    const updated = await updateMember(prisma, id, body, {
      id: session.user.id,
      role: session.user.role as "ADMIN" | "LEADER" | "MEMBER",
    });
    return NextResponse.json(updated);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireRole("ADMIN", "LEADER");
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    await archiveMember(prisma, id, {
      id: session.user.id,
      role: session.user.role as "ADMIN" | "LEADER",
    });
    return NextResponse.json({ archived: true });
  } catch (error) {
    return mapServiceError(error);
  }
}
