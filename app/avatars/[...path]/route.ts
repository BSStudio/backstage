import type { NextRequest } from "next/server";
import { getAvatar } from "@/lib/avatar-storage";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { path } = await params;
  if (path.length !== 1) {
    return new Response("Not found", { status: 404 });
  }

  const file = await getAvatar(path[0]);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file.body as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
