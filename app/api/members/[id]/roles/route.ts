import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { syncJson } from "@/lib/api-response";
import { mapServiceError, ValidationError } from "@/lib/errors";
import { canManageMembers, toActor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import {
  AssignRoleSchema,
  assignRole,
  removeRole,
} from "@/lib/services/members";
import { requirePermission } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await requirePermission(canManageMembers);
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
      toActor(session),
    );
    return syncJson({ assigned: true }, syncErrors);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requirePermission(canManageMembers);
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const { syncErrors } = await removeRole(prisma, id, toActor(session));
    return syncJson({ removed: true }, syncErrors);
  } catch (error) {
    return mapServiceError(error);
  }
}
