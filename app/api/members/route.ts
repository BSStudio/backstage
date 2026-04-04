import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/session";
import { currentSemester } from "@/types";

const CreateMemberSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nickname: z.string().optional(),
  email: z.email(),
  mobile: z.string().optional(),
  university: z.string().optional(),
  major: z.string().optional(),
  dormRoom: z.string().optional(),
  websiteUsername: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { searchParams } = req.nextUrl;
  const includeArchived = searchParams.get("archived") === "true";

  const members = await prisma.member.findMany({
    where: {
      archived: includeArchived ? undefined : false,
    },
    include: {
      leadershipRole: true,
    },
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
  });

  return NextResponse.json(members);
}

export async function POST(req: NextRequest) {
  const session = await requireRole("ADMIN", "LEADER");
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const parsed = CreateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Only admins can set websiteUsername
  const websiteUsername =
    session.user.role === "ADMIN" ? data.websiteUsername : undefined;

  // TODO: ID will come from Authentik when sync is implemented
  const member = await prisma.member.create({
    data: {
      id: crypto.randomUUID(),
      firstName: data.firstName,
      lastName: data.lastName,
      nickname: data.nickname,
      email: data.email,
      mobile: data.mobile,
      university: data.university,
      major: data.major,
      dormRoom: data.dormRoom,
      joinedSemester: currentSemester(),
      websiteUsername,
    },
  });

  await prisma.timelineEntry.create({
    data: {
      memberId: member.id,
      action: "MEMBER_CREATED",
      status: member.status,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      targetId: member.id,
      action: "MEMBER_CREATED",
      diff: { created: data } as object,
    },
  });

  return NextResponse.json(member, { status: 201 });
}
