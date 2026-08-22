import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error("health.database", { message: (error as Error).message });
    return NextResponse.json({ status: "error" }, { status: 503 });
  }

  return NextResponse.json({ status: "ok" });
}
