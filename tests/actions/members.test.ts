import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockCreateMember = vi.fn();
const mockUpdateMember = vi.fn();
const mockArchiveMember = vi.fn();
const mockBatchArchive = vi.fn();
const mockBatchUpdateStatus = vi.fn();
const mockAssignRole = vi.fn();
const mockRemoveRole = vi.fn();
const mockRevalidatePath = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockCreateMember.mockReset();
  mockUpdateMember.mockReset();
  mockArchiveMember.mockReset();
  mockBatchArchive.mockReset();
  mockBatchUpdateStatus.mockReset();
  mockAssignRole.mockReset();
  mockRemoveRole.mockReset();
  mockRevalidatePath.mockReset();

  vi.doMock("@/lib/session", () => ({ getSession: mockGetSession }));
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/services/members", () => ({
    createMember: mockCreateMember,
    updateMember: mockUpdateMember,
    archiveMember: mockArchiveMember,
    batchArchive: mockBatchArchive,
    batchUpdateStatus: mockBatchUpdateStatus,
    assignRole: mockAssignRole,
    removeRole: mockRemoveRole,
  }));
});

function session(role: string) {
  return { user: { id: "actor-id", role } };
}

// ─── createMemberAction ─────────────────────────────────────────────────────

describe("createMemberAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { createMemberAction } = await import("@/lib/actions/members");
    const result = await createMemberAction({ firstName: "A" });
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("returns error when role is MEMBER", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { createMemberAction } = await import("@/lib/actions/members");
    const result = await createMemberAction({ firstName: "A" });
    expect(result).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("maps ValidationError from service", async () => {
    const { ValidationError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockCreateMember.mockRejectedValue(new ValidationError("bad"));
    const { createMemberAction } = await import("@/lib/actions/members");
    const result = await createMemberAction({});
    expect(result).toEqual({ success: false, error: "Érvénytelen adatok" });
  });

  it("returns success and revalidates on creation", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockCreateMember.mockResolvedValue({
      member: { id: "new-id" },
      syncErrors: [],
    });
    const { createMemberAction } = await import("@/lib/actions/members");
    const result = await createMemberAction({ firstName: "A" });
    expect(result).toEqual({
      success: true,
      data: { id: "new-id" },
      syncErrors: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members");
  });
});

// ─── updateMemberAction ─────────────────────────────────────────────────────

describe("updateMemberAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { updateMemberAction } = await import("@/lib/actions/members");
    const result = await updateMemberAction("id", {});
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("maps NotFoundError from service", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockUpdateMember.mockRejectedValue(new NotFoundError());
    const { updateMemberAction } = await import("@/lib/actions/members");
    const result = await updateMemberAction("bad-id", {});
    expect(result).toEqual({ success: false, error: "Nem található" });
  });

  it("maps ForbiddenError from service", async () => {
    const { ForbiddenError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("MEMBER"));
    mockUpdateMember.mockRejectedValue(new ForbiddenError());
    const { updateMemberAction } = await import("@/lib/actions/members");
    const result = await updateMemberAction("id", {});
    expect(result).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("returns success and revalidates on update", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockUpdateMember.mockResolvedValue({
      member: { id: "m-1", nickname: "Updated" },
      syncErrors: [],
    });
    const { updateMemberAction } = await import("@/lib/actions/members");
    const result = await updateMemberAction("m-1", { nickname: "Updated" });
    expect(result).toEqual({
      success: true,
      data: { id: "m-1", nickname: "Updated" },
      syncErrors: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members/m-1");
  });
});

// ─── archiveMemberAction ────────────────────────────────────────────────────

describe("archiveMemberAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { archiveMemberAction } = await import("@/lib/actions/members");
    const result = await archiveMemberAction("id");
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("returns error when role is MEMBER", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { archiveMemberAction } = await import("@/lib/actions/members");
    const result = await archiveMemberAction("id");
    expect(result).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("maps NotFoundError from service", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockArchiveMember.mockRejectedValue(new NotFoundError());
    const { archiveMemberAction } = await import("@/lib/actions/members");
    const result = await archiveMemberAction("bad-id");
    expect(result).toEqual({ success: false, error: "Nem található" });
  });

  it("returns success and revalidates on archive", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockArchiveMember.mockResolvedValue({ syncErrors: [] });
    const { archiveMemberAction } = await import("@/lib/actions/members");
    const result = await archiveMemberAction("m-1");
    expect(result).toEqual({
      success: true,
      data: { archived: true },
      syncErrors: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members");
  });

  it("passes the Google Group removal flag to the service", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockArchiveMember.mockResolvedValue({ syncErrors: [] });
    const { archiveMemberAction } = await import("@/lib/actions/members");

    await archiveMemberAction("m-1", { removeFromGoogleGroup: true });

    expect(mockArchiveMember).toHaveBeenCalledWith(
      expect.anything(),
      "m-1",
      expect.anything(),
      { removeFromGoogleGroup: true },
    );
  });
});

// ─── batchArchiveAction ─────────────────────────────────────────────────────

describe("batchArchiveAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { batchArchiveAction } = await import("@/lib/actions/members");
    const result = await batchArchiveAction(["id-1"]);
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("returns error when role is MEMBER", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { batchArchiveAction } = await import("@/lib/actions/members");
    const result = await batchArchiveAction(["id-1"]);
    expect(result).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("returns success with count and revalidates", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockBatchArchive.mockResolvedValue({ count: 3, syncErrors: [] });
    const { batchArchiveAction } = await import("@/lib/actions/members");
    const result = await batchArchiveAction(["a", "b", "c"]);
    expect(result).toEqual({
      success: true,
      data: { count: 3 },
      syncErrors: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members");
  });
});

// ─── batchUpdateStatusAction ────────────────────────────────────────────────

describe("batchUpdateStatusAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { batchUpdateStatusAction } = await import("@/lib/actions/members");
    const result = await batchUpdateStatusAction(["id-1"], "MEMBER");
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("returns error when role is MEMBER", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { batchUpdateStatusAction } = await import("@/lib/actions/members");
    const result = await batchUpdateStatusAction(["id-1"], "MEMBER");
    expect(result).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("returns success with count and revalidates", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockBatchUpdateStatus.mockResolvedValue({ count: 2, syncErrors: [] });
    const { batchUpdateStatusAction } = await import("@/lib/actions/members");
    const result = await batchUpdateStatusAction(
      ["a", "b"],
      "MEMBER_CANDIDATE",
    );
    expect(result).toEqual({
      success: true,
      data: { count: 2 },
      syncErrors: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members");
  });
});

// ─── assignRoleAction ───────────────────────────────────────────────────────

describe("assignRoleAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { assignRoleAction } = await import("@/lib/actions/members");
    const result = await assignRoleAction("m-1", "Főszerkesztő", []);
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("returns error when role is MEMBER", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { assignRoleAction } = await import("@/lib/actions/members");
    const result = await assignRoleAction("m-1", "Főszerkesztő", []);
    expect(result).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("maps NotFoundError from service", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockAssignRole.mockRejectedValue(new NotFoundError());
    const { assignRoleAction } = await import("@/lib/actions/members");
    const result = await assignRoleAction("bad-id", "Főszerkesztő", []);
    expect(result).toEqual({ success: false, error: "Nem található" });
  });

  it("returns success and revalidates on assignment", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockAssignRole.mockResolvedValue({ syncErrors: [] });
    const { assignRoleAction } = await import("@/lib/actions/members");
    const result = await assignRoleAction("m-1", "Főszerkesztő", ["group-1"]);
    expect(result).toEqual({ success: true, data: null, syncErrors: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members/m-1");
  });
});

// ─── removeRoleAction ───────────────────────────────────────────────────────

describe("removeRoleAction", () => {
  it("returns error when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { removeRoleAction } = await import("@/lib/actions/members");
    const result = await removeRoleAction("m-1");
    expect(result).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
  });

  it("returns error when role is MEMBER", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { removeRoleAction } = await import("@/lib/actions/members");
    const result = await removeRoleAction("m-1");
    expect(result).toEqual({
      success: false,
      error: "Hozzáférés megtagadva",
    });
  });

  it("maps NotFoundError from service", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockRemoveRole.mockRejectedValue(new NotFoundError());
    const { removeRoleAction } = await import("@/lib/actions/members");
    const result = await removeRoleAction("bad-id");
    expect(result).toEqual({ success: false, error: "Nem található" });
  });

  it("returns success and revalidates on removal", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockRemoveRole.mockResolvedValue({ syncErrors: [] });
    const { removeRoleAction } = await import("@/lib/actions/members");
    const result = await removeRoleAction("m-1");
    expect(result).toEqual({ success: true, data: null, syncErrors: [] });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members/m-1");
  });
});
