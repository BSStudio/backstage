import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuthApi } from "../helpers";

const mockGetSession = vi.fn();
const mockRefresh = vi.fn();
const mockAnnotate = vi.fn();
const mockRevalidatePath = vi.fn();
const mockCaptureServiceError = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockRefresh.mockReset();
  mockAnnotate.mockReset();
  mockRevalidatePath.mockReset();
  mockCaptureServiceError.mockReset();

  mockAuthApi(mockGetSession);
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/observability/capture", () => ({
    captureServiceError: mockCaptureServiceError,
  }));
  vi.doMock("@/lib/services/google-group", () => ({
    refreshGoogleGroupEntries: mockRefresh,
    annotateGoogleGroupEntry: mockAnnotate,
  }));
});

function session(role: string) {
  return { user: { id: "actor-id", role } };
}

describe("refreshGoogleGroupAction", () => {
  it("rejects a request with no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const { refreshGoogleGroupAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(await refreshGoogleGroupAction()).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("rejects a leader", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    const { refreshGoogleGroupAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(await refreshGoogleGroupAction()).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("returns the number of addresses read", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRefresh.mockResolvedValue({ count: 12 });
    const { refreshGoogleGroupAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(await refreshGoogleGroupAction()).toEqual({
      success: true,
      data: { count: 12 },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/google-group");
  });

  it("surfaces a Google API failure verbatim and reports it", async () => {
    const { GoogleApiError } = await import("@/lib/google/client");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRefresh.mockRejectedValue(
      new GoogleApiError(403, { error: { message: "Permission denied" } }),
    );
    const { refreshGoogleGroupAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(await refreshGoogleGroupAction()).toEqual({
      success: false,
      error: "Google API error: Permission denied",
    });
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
  });

  it("maps a missing configuration to a validation message", async () => {
    const { ValidationError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRefresh.mockRejectedValue(new ValidationError({ config: "hiányzik" }));
    const { refreshGoogleGroupAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(await refreshGoogleGroupAction()).toEqual({
      success: false,
      error: "Érvénytelen adatok",
    });
  });
});

describe("annotateGoogleGroupEntryAction", () => {
  it("rejects a non-admin", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { annotateGoogleGroupEntryAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(
      await annotateGoogleGroupEntryAction("a@b.hu", {
        matchStatus: "UNKNOWN",
      }),
    ).toEqual({ success: false, error: "Hozzáférés megtagadva" });
  });

  it("returns the annotated address", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockAnnotate.mockResolvedValue({ email: "a@b.hu" });
    const { annotateGoogleGroupEntryAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(
      await annotateGoogleGroupEntryAction("a@b.hu", {
        matchStatus: "SECONDARY_EMAIL",
        memberId: "m-1",
      }),
    ).toEqual({ success: true, data: { email: "a@b.hu" } });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/google-group");
  });

  it("maps a missing entry to a not-found message", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockAnnotate.mockRejectedValue(new NotFoundError());
    const { annotateGoogleGroupEntryAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(
      await annotateGoogleGroupEntryAction("nincs@b.hu", {
        matchStatus: "UNKNOWN",
      }),
    ).toEqual({ success: false, error: "Nem található" });
  });

  it("maps a service-level forbidden error", async () => {
    const { ForbiddenError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockAnnotate.mockRejectedValue(new ForbiddenError());
    const { annotateGoogleGroupEntryAction } = await import(
      "@/lib/actions/google-group"
    );

    expect(
      await annotateGoogleGroupEntryAction("a@b.hu", {
        matchStatus: "UNKNOWN",
      }),
    ).toEqual({ success: false, error: "Hozzáférés megtagadva" });
  });
});
