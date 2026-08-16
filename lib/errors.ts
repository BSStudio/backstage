import { NextResponse } from "next/server";
import { captureServiceError } from "@/lib/observability/capture";

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = "Not found") {
    super(message);
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = "Forbidden") {
    super(message);
  }
}

export class ValidationError extends ServiceError {
  readonly details: unknown;

  constructor(details: unknown) {
    super("Validation failed");
    this.details = details;
  }
}

/** Map service-layer errors to JSON responses. Unknown errors become 500. */
export function mapServiceError(error: unknown): NextResponse {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.details }, { status: 400 });
  }
  captureServiceError(error);
  console.error("Unhandled service error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
