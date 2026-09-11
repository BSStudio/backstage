import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuthApi } from "../helpers";

const mockGetSession = vi.fn();
const mockForceFullSync = vi.fn();
const mockRevalidatePath = vi.fn();
const mockCaptureServiceError = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockForceFullSync.mockReset();
  mockRevalidatePath.mockReset();
  mockCaptureServiceError.mockReset();

  mockAuthApi(mockGetSession);
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/observability/capture", () => ({
    captureServiceError: mockCaptureServiceError,
  }));
  vi.doMock("@/lib/services/website", () => ({
    forceWebsiteFullSync: mockForceFullSync,
  }));
});

function session(role: string) {
  return { user: { id: "actor-id", role } };
}

async function importAction() {
  const { forceWebsiteFullSyncAction } = await import("@/lib/actions/website");
  return forceWebsiteFullSyncAction;
}

describe("forceWebsiteFullSyncAction", () => {
  it("rejects a request with no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const action = await importAction();

    expect(await action()).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
    expect(mockForceFullSync).not.toHaveBeenCalled();
  });

  it("rejects a leader before the service is reached", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    const action = await importAction();

    expect(await action()).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
    expect(mockForceFullSync).not.toHaveBeenCalled();
  });

  it("reports how many members went over", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockForceFullSync.mockResolvedValue({ count: 43, result: null });
    const action = await importAction();

    expect(await action()).toEqual({
      success: true,
      data: { count: 43 },
      syncErrors: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/sync-jobs");
  });

  it("shows what the website refused, verbatim", async () => {
    const { WebsiteWebhookError } = await import("@/lib/website/webhook");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockForceFullSync.mockRejectedValue(
      new WebsiteWebhookError(400, {
        problems: ["sub: kötelező mező."],
      }),
    );
    const action = await importAction();

    expect(await action()).toEqual({
      success: false,
      error: "Website webhook error: sub: kötelező mező.",
    });
    expect(mockCaptureServiceError).toHaveBeenCalled();
  });

  it("names the missing configuration rather than the generic message", async () => {
    const { ValidationError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockForceFullSync.mockRejectedValue(
      new ValidationError({ config: "nope" }),
    );
    const action = await importAction();

    expect(await action()).toEqual({
      success: false,
      error: "A honlap szinkronizálása nincs beállítva",
    });
  });
});
