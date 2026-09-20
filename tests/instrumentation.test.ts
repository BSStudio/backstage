import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureRequestError, mockServerConfig, mockEdgeConfig } =
  vi.hoisted(() => ({
    mockCaptureRequestError: vi.fn(),
    mockServerConfig: vi.fn(),
    mockEdgeConfig: vi.fn(),
  }));

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: mockCaptureRequestError,
}));

// The factories stand in for the Sentry.init each config runs on import, so calling them
// records that the import happened.
vi.mock("@/sentry.server.config", () => {
  mockServerConfig();
  return {};
});

vi.mock("@/sentry.edge.config", () => {
  mockEdgeConfig();
  return {};
});

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

describe("register", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads the server config under the node runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");

    await register();

    expect(mockServerConfig).toHaveBeenCalled();
    expect(mockEdgeConfig).not.toHaveBeenCalled();
  });

  it("loads the edge config under the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("@/instrumentation");

    await register();

    expect(mockEdgeConfig).toHaveBeenCalled();
    expect(mockServerConfig).not.toHaveBeenCalled();
  });

  it("loads neither outside a known runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", undefined);
    const { register } = await import("@/instrumentation");

    await register();

    expect(mockServerConfig).not.toHaveBeenCalled();
    expect(mockEdgeConfig).not.toHaveBeenCalled();
  });
});
