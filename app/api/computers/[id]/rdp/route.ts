import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { mapServiceError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import { buildComputerRdp } from "@/lib/services/computers";
import { requireAuth } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// A route handler rather than a Server Action: the browser needs a URL it can follow to a
// Content-Disposition, and an action would mean assembling the file client-side.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    const { filename, content } = await buildComputerRdp(
      prisma,
      id,
      session.user.authentikUsername ?? null,
    );

    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/x-rdp",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // The file names whoever asked for it, so no shared cache may hand it on.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return mapServiceError(error);
  }
}
