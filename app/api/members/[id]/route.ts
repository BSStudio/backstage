import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/session";
import { MEMBERSHIP_STATUSES } from "@/types";

type Params = { params: Promise<{ id: string }> };

const UpdateMemberSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  nickname: z.string().trim().optional(),
  email: z.email().optional(),
  mobile: z.string().trim().optional(),
  university: z.string().trim().optional(),
  major: z.string().trim().optional(),
  dormRoom: z.string().trim().optional(),
  websiteUsername: z.string().trim().optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      leadershipRole: true,
      timeline: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(member);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Members can only edit themselves, leaders/admins can edit anyone
  const isSelf = session.user.id === member.id;
  const isLeaderOrAdmin = ["ADMIN", "LEADER"].includes(session.user.role);
  if (!isSelf && !isLeaderOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = UpdateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const data = { ...parsed.data };

  // Only admins can change websiteUsername
  if (data.websiteUsername !== undefined && session.user.role !== "ADMIN") {
    delete data.websiteUsername;
  }

  // Status changes require leader/admin
  const statusChanging = data.status && data.status !== member.status;
  if (statusChanging && !isLeaderOrAdmin) {
    return NextResponse.json(
      { error: "Only leaders and admins can change status" },
      { status: 403 },
    );
  }

  // Build diff for audit log
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && (member as Record<string, unknown>)[key] !== val) {
      diff[key] = { old: (member as Record<string, unknown>)[key], new: val };
    }
  }

  if (Object.keys(diff).length === 0) {
    return NextResponse.json(member);
  }

  const updated = await prisma.member.update({
    where: { id },
    data,
  });

  // Timeline entry for status changes
  if (statusChanging) {
    await prisma.timelineEntry.create({
      data: {
        memberId: member.id,
        action: "STATUS_CHANGED",
        status: data.status,
      },
    });
  }

  // Audit log - separate entries for status changes and field updates
  if (statusChanging) {
    const { status: statusDiff, ...fieldDiff } = diff;
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        targetId: member.id,
        action: "STATUS_CHANGED",
        diff: { status: statusDiff } as object,
      },
    });
    if (Object.keys(fieldDiff).length > 0) {
      await prisma.auditLog.create({
        data: {
          actorId: session.user.id,
          targetId: member.id,
          action: "MEMBER_UPDATED",
          diff: fieldDiff as object,
        },
      });
    }
  } else {
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        targetId: member.id,
        action: "MEMBER_UPDATED",
        diff: diff as object,
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireRole("ADMIN", "LEADER");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.member.update({
    where: { id },
    data: {
      archived: true,
      archivedAt: new Date(),
    },
  });

  await prisma.timelineEntry.create({
    data: {
      memberId: member.id,
      action: "MEMBER_ARCHIVED",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      targetId: member.id,
      action: "MEMBER_ARCHIVED",
      diff: { archived: { old: false, new: true } },
    },
  });

  return NextResponse.json({ archived: true });
}
