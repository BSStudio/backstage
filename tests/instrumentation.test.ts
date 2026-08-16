import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureRequestError } = vi.hoisted(() => ({
  mockCaptureRequestError: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: mockCaptureRequestError,
}));

import { onRequestError } from "@/instrumentation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const request = { path: "/members/1", method: "GET", headers: {} };
const context = {
  routerKind: "App Router",
  routePath: "/members/[id]",
  routeType: "render",
} as Parameters<typeof onRequestError>[2];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("onRequestError", () => {
  it("reports an unexpected render error", () => {
    const error = new Error("Authentik 502");

    onRequestError(error, request, context);

    expect(mockCaptureRequestError).toHaveBeenCalledWith(
      error,
      request,
      context,
    );
  });

  it("ignores the typed service errors a page threw on purpose", () => {
    onRequestError(new NotFoundError(), request, context);
    onRequestError(new ForbiddenError(), request, context);
    onRequestError(new ValidationError({}), request, context);

    expect(mockCaptureRequestError).not.toHaveBeenCalled();
  });
});
