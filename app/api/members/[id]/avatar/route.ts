import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { deleteAvatars, saveAvatar } from "@/lib/avatar-storage";
import { mapServiceError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import {
  ensureCanModifyAvatar,
  removeMemberAvatar,
  uploadMemberAvatar,
} from "@/lib/services/members";
import { requireAuth } from "@/lib/session";
import type { UserRole } from "@/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const actor = { id: session.user.id, role: session.user.role as UserRole };

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    ensureCanModifyAvatar(actor, id);
  } catch (error) {
    return mapServiceError(error);
  }

  const formData = await req.formData();
  const squareFile = formData.get("square") as File | null;
  const portraitFile = formData.get("portrait") as File | null;

  if (!squareFile || !portraitFile) {
    return NextResponse.json(
      { error: "Both square and portrait images are required" },
      { status: 400 },
    );
  }

  const [squareBuffer, portraitBuffer] = await Promise.all([
    squareFile.arrayBuffer().then((ab) => Buffer.from(ab)),
    portraitFile.arrayBuffer().then((ab) => Buffer.from(ab)),
  ]);

  let avatarUrl: string;
  let portraitUrl: string;
  try {
    [avatarUrl, portraitUrl] = await Promise.all([
      saveAvatar(id, "square", squareBuffer),
      saveAvatar(id, "portrait", portraitBuffer),
    ]);
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { syncErrors } = await uploadMemberAvatar(
      prisma,
      id,
      { avatarUrl, portraitUrl },
      actor,
    );
    if (syncErrors.length > 0) {
      return NextResponse.json(
        { avatarUrl, portraitUrl, syncErrors },
        { status: 207 },
      );
    }
    return NextResponse.json({ avatarUrl, portraitUrl });
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const actor = { id: session.user.id, role: session.user.role as UserRole };

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    ensureCanModifyAvatar(actor, id);
  } catch (error) {
    return mapServiceError(error);
  }

  await deleteAvatars(id);

  try {
    const { syncErrors } = await removeMemberAvatar(prisma, id, actor);
    if (syncErrors.length > 0) {
      return NextResponse.json(
        { avatarUrl: null, portraitUrl: null, syncErrors },
        { status: 207 },
      );
    }
    return NextResponse.json({ avatarUrl: null, portraitUrl: null });
  } catch (error) {
    return mapServiceError(error);
  }
}
