import type { NextRequest } from "next/server";
import { getAvatar } from "@/lib/avatar-storage";

type Params = { params: Promise<{ path: string[] }> };

// The URL never changes on a replace, so a short TTL is what lets a new image through; the stale
// windows let Cloudflare keep serving while it revalidates or while the origin is down.
const AVATAR_CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=86400, stale-if-error=604800";

// A cached 404 would keep hiding an avatar uploaded right after a removal.
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { path } = await params;
  if (path.length !== 1) {
    return notFound();
  }

  const file = await getAvatar(path[0]);
  if (!file) {
    return notFound();
  }

  return new Response(file.body as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": AVATAR_CACHE_CONTROL,
    },
  });
}
