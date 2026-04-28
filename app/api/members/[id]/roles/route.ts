import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { mapServiceError, ValidationError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import {
  AssignRoleSchema,
  assignRole,
  removeRole,
} from "@/lib/services/members";
import { requireRole } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await requireRole("ADMIN", "LEADER");
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = AssignRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(z.treeifyError(parsed.error));
    }

    const { syncErrors } = await assignRole(
      prisma,
      id,
      parsed.data.label,
      parsed.data.authentikGroupIds,
      {
        id: session.user.id,
        role: session.user.role as "ADMIN" | "LEADER",
      },
    );
    if (syncErrors.length > 0) {
      return NextResponse.json({ assigned: true, syncErrors }, { status: 207 });
    }
    return NextResponse.json({ assigned: true });
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireRole("ADMIN", "LEADER");
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const { syncErrors } = await removeRole(prisma, id, {
      id: session.user.id,
      role: session.user.role as "ADMIN" | "LEADER",
    });
    if (syncErrors.length > 0) {
      return NextResponse.json({ removed: true, syncErrors }, { status: 207 });
    }
    return NextResponse.json({ removed: true });
  } catch (error) {
    return mapServiceError(error);
  }
}
