import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { syncJson } from "@/lib/api-response";
import { deleteAvatars, saveAvatar } from "@/lib/avatar-storage";
import { mapServiceError } from "@/lib/errors";
import { ensureCanModifyMember, toActor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { removeMemberAvatar, uploadMemberAvatar } from "@/lib/services/members";
import { requireAuth } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const actor = toActor(session);

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    ensureCanModifyMember(actor, id);
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
    return syncJson({ avatarUrl, portraitUrl }, syncErrors);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const actor = toActor(session);

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    ensureCanModifyMember(actor, id);
  } catch (error) {
    return mapServiceError(error);
  }

  await deleteAvatars(id);

  try {
    const { syncErrors } = await removeMemberAvatar(prisma, id, actor);
    return syncJson({ avatarUrl: null, portraitUrl: null }, syncErrors);
  } catch (error) {
    return mapServiceError(error);
  }
}
