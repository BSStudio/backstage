import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuthApi } from "../helpers";

const mockGetSession = vi.fn();
const mockRetrySyncJob = vi.fn();
const mockRevalidatePath = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockRetrySyncJob.mockReset();
  mockRevalidatePath.mockReset();

  mockAuthApi(mockGetSession);
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/services/sync-jobs", () => ({
    retrySyncJob: mockRetrySyncJob,
  }));
});

function session(role: string) {
  return { user: { id: "actor-id", role } };
}

describe("retrySyncJobAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { retrySyncJobAction } = await import("@/lib/actions/sync-jobs");
    const result = await retrySyncJobAction("job-id");
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("maps ForbiddenError when role is not ADMIN", async () => {
    const { ForbiddenError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockRetrySyncJob.mockRejectedValue(new ForbiddenError());
    const { retrySyncJobAction } = await import("@/lib/actions/sync-jobs");
    const result = await retrySyncJobAction("job-id");
    expect(result).toEqual({ success: false, error: "Hozzáférés megtagadva" });
  });

  it("maps NotFoundError from service", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRetrySyncJob.mockRejectedValue(new NotFoundError());
    const { retrySyncJobAction } = await import("@/lib/actions/sync-jobs");
    const result = await retrySyncJobAction("missing");
    expect(result).toEqual({ success: false, error: "Nem található" });
  });

  it("maps ValidationError from service", async () => {
    const { ValidationError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRetrySyncJob.mockRejectedValue(new ValidationError("not failed"));
    const { retrySyncJobAction } = await import("@/lib/actions/sync-jobs");
    const result = await retrySyncJobAction("job-id");
    expect(result).toEqual({
      success: false,
      error: "Csak sikertelen feladatok indíthatók újra",
    });
  });

  it("returns success and revalidates on successful retry", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRetrySyncJob.mockResolvedValue({ success: true, result: { ok: true } });
    const { retrySyncJobAction } = await import("@/lib/actions/sync-jobs");
    const result = await retrySyncJobAction("job-id");
    expect(result).toEqual({
      success: true,
      data: { syncSuccess: true, syncError: undefined },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/sync-jobs");
  });

  it("returns syncSuccess=false with error when sync retry fails", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRetrySyncJob.mockResolvedValue({
      success: false,
      error: "Authentik unreachable",
    });
    const { retrySyncJobAction } = await import("@/lib/actions/sync-jobs");
    const result = await retrySyncJobAction("job-id");
    expect(result).toEqual({
      success: true,
      data: { syncSuccess: false, syncError: "Authentik unreachable" },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/sync-jobs");
  });
});
