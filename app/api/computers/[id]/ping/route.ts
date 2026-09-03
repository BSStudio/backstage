import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiClient } from "@/lib/api-client-auth";
import { mapServiceError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import prisma from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { recordComputerPing } from "@/lib/services/computers";

type Params = { params: Promise<{ id: string }> };

// An agent pings once a minute. Anything near this ceiling is a schedule misconfigured
// into a loop, not a machine reporting faster than we asked.
const rateLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(req: NextRequest, { params }: Params) {
  const agent = await requireApiClient(req, "computerAgent");
  if (agent instanceof NextResponse) return agent;

  const { id } = await params;
  // Service account names are not PII, so this is logged unscrubbed.
  const caller = { computerId: id, sub: agent.sub, caller: agent.username };

  const { allowed, retryAfterSeconds } = rateLimiter.consume(agent.sub);
  if (!allowed) {
    logger.warn("computers.ping", { ...caller, outcome: "rate_limited" });
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  // A mangled body becomes a 400 from the schema rather than a Sentry incident of ours.
  const body = await req.json().catch(() => null);

  try {
    const { computer, registered } = await recordComputerPing(
      prisma,
      id,
      body,
      agent,
    );
    logger.info("computers.ping", {
      ...caller,
      outcome: registered ? "registered" : "ok",
    });
    return NextResponse.json(
      { id: computer.id, lastSeenAt: computer.lastSeenAt },
      { status: registered ? 201 : 200 },
    );
  } catch (error) {
    logger.warn("computers.ping", {
      ...caller,
      outcome: "error",
      message: (error as Error).message,
    });
    return mapServiceError(error);
  }
}
