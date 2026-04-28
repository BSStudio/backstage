import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { deleteAvatars, saveAvatar } from "@/lib/avatar-storage";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import {
  buildAuthentikAttributes,
  orchestrateUpdateAttributes,
} from "@/lib/sync/authentik/orchestrators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  // Members can upload their own avatar; leaders/admins can upload for anyone
  const isSelf = session.user.id === id;
  const isLeaderOrAdmin = ["ADMIN", "LEADER"].includes(
    session.user.role as string,
  );
  if (!isSelf && !isLeaderOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  try {
    const [avatarUrl, portraitUrl] = await Promise.all([
      saveAvatar(id, "square", squareBuffer),
      saveAvatar(id, "portrait", portraitBuffer),
    ]);

    const updated = await prisma.member.update({
      where: { id },
      data: { avatarUrl, portraitUrl },
    });

    const syncResult = await orchestrateUpdateAttributes(prisma, id, {
      attributes: buildAuthentikAttributes(updated),
    });

    if (!syncResult.success) {
      return NextResponse.json(
        { avatarUrl, portraitUrl, syncErrors: [syncResult.error] },
        { status: 207 },
      );
    }

    return NextResponse.json({ avatarUrl, portraitUrl });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const isSelf = session.user.id === id;
  const isLeaderOrAdmin = ["ADMIN", "LEADER"].includes(
    session.user.role as string,
  );
  if (!isSelf && !isLeaderOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await prisma.member.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteAvatars(id);

  const updated = await prisma.member.update({
    where: { id },
    data: { avatarUrl: null, portraitUrl: null },
  });

  const syncResult = await orchestrateUpdateAttributes(prisma, id, {
    attributes: buildAuthentikAttributes(updated),
  });

  if (!syncResult.success) {
    return NextResponse.json(
      {
        avatarUrl: null,
        portraitUrl: null,
        syncErrors: [syncResult.error],
      },
      { status: 207 },
    );
  }

  return NextResponse.json({ avatarUrl: null, portraitUrl: null });
}
