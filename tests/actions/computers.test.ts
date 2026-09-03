import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuthApi } from "../helpers";

const mockGetSession = vi.fn();
const mockDelete = vi.fn();
const mockRevalidatePath = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockDelete.mockReset();
  mockRevalidatePath.mockReset();

  mockAuthApi(mockGetSession);
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/services/computers", () => ({
    deleteComputer: mockDelete,
  }));
});

function session(role: string) {
  return { user: { id: "actor-id", role } };
}

const FORBIDDEN = { success: false, error: "Hozzáférés megtagadva" };

async function importAction() {
  return import("@/lib/actions/computers");
}

describe("deleteComputerAction", () => {
  it("deletes for an admin and revalidates both pages showing the machine", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockDelete.mockResolvedValue({ deleted: true });

    const { deleteComputerAction } = await importAction();

    expect(await deleteComputerAction("nle4")).toEqual({
      success: true,
      data: null,
    });
    expect(mockDelete).toHaveBeenCalledWith({}, "nle4", {
      id: "actor-id",
      role: "ADMIN",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/computers");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it.each([["LEADER"], ["MEMBER"]])("refuses %s", async (role) => {
    mockGetSession.mockResolvedValue(session(role));

    const { deleteComputerAction } = await importAction();

    expect(await deleteComputerAction("nle4")).toEqual(FORBIDDEN);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    mockGetSession.mockResolvedValue(null);

    const { deleteComputerAction } = await importAction();

    expect(await deleteComputerAction("nle4")).toEqual(FORBIDDEN);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("maps a missing machine to a result rather than throwing", async () => {
    // Imported after resetModules, or the action's instanceof check sees another instance.
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockDelete.mockRejectedValue(new NotFoundError());

    const { deleteComputerAction } = await importAction();

    expect(await deleteComputerAction("nope")).toEqual({
      success: false,
      error: "Nem található",
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
