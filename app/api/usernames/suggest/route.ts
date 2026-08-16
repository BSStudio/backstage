import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiClient } from "@/lib/api-client-auth";
import { mapServiceError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { suggestUsername } from "@/lib/services/usernames";

const QuerySchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
});

const rateLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(req: NextRequest) {
  const client = await requireApiClient(req);
  if (client instanceof NextResponse) return client;

  // Service account names are not PII, so this is logged unscrubbed.
  const caller = { sub: client.sub, caller: client.username };

  const { allowed, retryAfterSeconds } = rateLimiter.consume(client.sub);
  if (!allowed) {
    logger.warn("usernames.suggest", { ...caller, outcome: "rate_limited" });
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const params = req.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    firstName: params.get("firstName") ?? undefined,
    lastName: params.get("lastName") ?? undefined,
  });
  if (!parsed.success) {
    logger.warn("usernames.suggest", { ...caller, outcome: "invalid_request" });
    return mapServiceError(new ValidationError(z.treeifyError(parsed.error)));
  }

  try {
    const username = await suggestUsername(
      parsed.data.firstName,
      parsed.data.lastName,
    );
    logger.info("usernames.suggest", { ...caller, outcome: "ok", username });
    return NextResponse.json({ username });
  } catch (error) {
    logger.error("usernames.suggest", {
      ...caller,
      outcome: "error",
      message: (error as Error).message,
    });
    return mapServiceError(error);
  }
}
