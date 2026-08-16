import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureServiceError } = vi.hoisted(() => ({
  mockCaptureServiceError: vi.fn(),
}));

vi.mock("@/lib/observability/capture", () => ({
  captureServiceError: mockCaptureServiceError,
}));

import {
  ForbiddenError,
  mapServiceError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mapServiceError", () => {
  it("maps the typed errors to their status codes", async () => {
    const notFound = mapServiceError(new NotFoundError("Nincs ilyen tag"));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "Nincs ilyen tag" });

    const forbidden = mapServiceError(new ForbiddenError());
    expect(forbidden.status).toBe(403);

    const invalid = mapServiceError(new ValidationError({ email: "kell" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: { email: "kell" } });
  });

  it("does not report the typed errors — they are control flow", () => {
    mapServiceError(new NotFoundError());
    mapServiceError(new ForbiddenError());
    mapServiceError(new ValidationError({}));

    expect(mockCaptureServiceError).not.toHaveBeenCalled();
  });

  it("reports anything else behind a 500 without leaking the message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Authentik refused kovacs.janos@bsstudio.hu");

    const response = mapServiceError(error);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(mockCaptureServiceError).toHaveBeenCalledWith(error);
  });

  it("reports a thrown non-Error value too", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(mapServiceError("boom").status).toBe(500);
    expect(mockCaptureServiceError).toHaveBeenCalledWith("boom");
  });
});
