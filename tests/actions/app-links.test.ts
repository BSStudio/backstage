import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuthApi } from "../helpers";

const mockGetSession = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockMove = vi.fn();
const mockRevalidatePath = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockMove.mockReset();
  mockRevalidatePath.mockReset();

  mockAuthApi(mockGetSession);
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/services/app-links", () => ({
    createAppLink: mockCreate,
    updateAppLink: mockUpdate,
    deleteAppLink: mockDelete,
    moveAppLink: mockMove,
  }));
});

function session(role: string) {
  return { user: { id: "actor-id", role } };
}

const FORBIDDEN = { success: false, error: "Hozzáférés megtagadva" };

const VALID = {
  name: "Wiki",
  url: "https://wiki.bsstudio.hu",
  icon: "book-open",
};

async function actions() {
  return import("@/lib/actions/app-links");
}

describe("createAppLinkAction", () => {
  it("rejects a request with no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const { createAppLinkAction } = await actions();

    expect(await createAppLinkAction(VALID)).toEqual(FORBIDDEN);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a leader - the admin area splits on read versus write", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    const { createAppLinkAction } = await actions();

    expect(await createAppLinkAction(VALID)).toEqual(FORBIDDEN);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns the created link and revalidates every page showing it", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockCreate.mockResolvedValue({ id: "link-1", name: "Wiki" });
    const { createAppLinkAction } = await actions();

    expect(await createAppLinkAction(VALID)).toEqual({
      success: true,
      data: { id: "link-1", name: "Wiki" },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/apps");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/apps");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("maps a validation failure to a Hungarian message", async () => {
    const { ValidationError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockCreate.mockRejectedValue(new ValidationError({ url: "rossz" }));
    const { createAppLinkAction } = await actions();

    expect(await createAppLinkAction(VALID)).toEqual({
      success: false,
      error: "Érvénytelen alkalmazásadatok",
    });
  });
});

describe("updateAppLinkAction", () => {
  it("rejects a member", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { updateAppLinkAction } = await actions();

    expect(await updateAppLinkAction("link-1", { name: "X" })).toEqual(
      FORBIDDEN,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns the updated link", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockUpdate.mockResolvedValue({ id: "link-1", name: "Stúdió wiki" });
    const { updateAppLinkAction } = await actions();

    expect(
      await updateAppLinkAction("link-1", { name: "Stúdió wiki" }),
    ).toEqual({
      success: true,
      data: { id: "link-1", name: "Stúdió wiki" },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/apps");
  });

  it("maps a missing link to a not-found message", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockUpdate.mockRejectedValue(new NotFoundError());
    const { updateAppLinkAction } = await actions();

    expect(await updateAppLinkAction("nope", { name: "X" })).toEqual({
      success: false,
      error: "Nem található",
    });
  });
});

describe("deleteAppLinkAction", () => {
  it("rejects a leader", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    const { deleteAppLinkAction } = await actions();

    expect(await deleteAppLinkAction("link-1")).toEqual(FORBIDDEN);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the link", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockDelete.mockResolvedValue({ deleted: true });
    const { deleteAppLinkAction } = await actions();

    expect(await deleteAppLinkAction("link-1")).toEqual({
      success: true,
      data: null,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/apps");
  });

  it("maps a missing link to a not-found message", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockDelete.mockRejectedValue(new NotFoundError());
    const { deleteAppLinkAction } = await actions();

    expect(await deleteAppLinkAction("nope")).toEqual({
      success: false,
      error: "Nem található",
    });
  });
});

describe("moveAppLinkAction", () => {
  it("rejects a member", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));
    const { moveAppLinkAction } = await actions();

    expect(await moveAppLinkAction("link-1", "UP")).toEqual(FORBIDDEN);
    expect(mockMove).not.toHaveBeenCalled();
  });

  it("reports whether the link actually moved", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockMove.mockResolvedValue({ moved: false });
    const { moveAppLinkAction } = await actions();

    expect(await moveAppLinkAction("link-1", "UP")).toEqual({
      success: true,
      data: { moved: false },
    });
    expect(mockMove).toHaveBeenCalledWith({}, "link-1", "UP", {
      id: "actor-id",
      role: "ADMIN",
    });
  });

  it("maps a missing link to a not-found message", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockMove.mockRejectedValue(new NotFoundError());
    const { moveAppLinkAction } = await actions();

    expect(await moveAppLinkAction("nope", "DOWN")).toEqual({
      success: false,
      error: "Nem található",
    });
  });
});
