import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { syncJson } from "@/lib/api-response";
import { deleteAvatars, saveAvatar } from "@/lib/avatar-storage";
import { mapServiceError, NotFoundError } from "@/lib/errors";
import { type Actor, ensureCanModifyMember, toActor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { removeMemberAvatar, uploadMemberAvatar } from "@/lib/services/members";
import { requireAuth } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// The services guard these mutations too, but both handlers write to storage before calling
// one, so the check has to happen here as well or an unauthorised caller moves bytes first.
async function authorizeAvatarChange(
  id: string,
): Promise<Actor | NextResponse> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  if (!(await prisma.member.count({ where: { id } }))) {
    return mapServiceError(new NotFoundError());
  }

  const actor = toActor(session);
  try {
    ensureCanModifyMember(actor, id);
  } catch (error) {
    return mapServiceError(error);
  }
  return actor;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const actor = await authorizeAvatarChange(id);
  if (actor instanceof NextResponse) return actor;

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
  const { id } = await params;
  const actor = await authorizeAvatarChange(id);
  if (actor instanceof NextResponse) return actor;

  await deleteAvatars(id);

  try {
    const { syncErrors } = await removeMemberAvatar(prisma, id, actor);
    return syncJson({ avatarUrl: null, portraitUrl: null }, syncErrors);
  } catch (error) {
    return mapServiceError(error);
  }
}
