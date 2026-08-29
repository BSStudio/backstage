import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuthApi } from "../helpers";

const mockGetSession = vi.fn();
const mockCreateCardDavToken = vi.fn();
const mockRevokeCardDavToken = vi.fn();
const mockRevalidatePath = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockCreateCardDavToken.mockReset();
  mockRevokeCardDavToken.mockReset();
  mockRevalidatePath.mockReset();

  mockAuthApi(mockGetSession);
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/services/carddav", () => ({
    createCardDavToken: mockCreateCardDavToken,
    revokeCardDavToken: mockRevokeCardDavToken,
  }));
});

function session(id = "member-id", role = "MEMBER") {
  return { user: { id, role } };
}

async function importActions() {
  return import("@/lib/actions/carddav");
}

describe("createCardDavTokenAction", () => {
  it("refuses an unauthenticated caller without reaching the service", async () => {
    mockGetSession.mockResolvedValue(null);

    const { createCardDavTokenAction } = await importActions();

    expect(
      await createCardDavTokenAction("member-id", { label: "iPhone" }),
    ).toEqual({ success: false, error: "Jogosulatlan hozzáférés" });
    expect(mockCreateCardDavToken).not.toHaveBeenCalled();
  });

  it("returns the minted token and revalidates the member's page", async () => {
    mockGetSession.mockResolvedValue(session());
    mockCreateCardDavToken.mockResolvedValue({
      id: "token-id",
      label: "iPhone",
      createdAt: new Date("2026-08-29T10:00:00Z"),
      token: "the-only-time-this-is-seen",
    });

    const { createCardDavTokenAction } = await importActions();
    const result = await createCardDavTokenAction("member-id", {
      label: "iPhone",
    });

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ token: "the-only-time-this-is-seen" }),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members/member-id");
  });

  it("maps a refusal to mint for someone else", async () => {
    const { ForbiddenError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session("leader-id", "LEADER"));
    mockCreateCardDavToken.mockRejectedValue(new ForbiddenError());

    const { createCardDavTokenAction } = await importActions();

    expect(
      await createCardDavTokenAction("member-id", { label: "iPhone" }),
    ).toEqual({ success: false, error: "Hozzáférés megtagadva" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("maps a rejected label to its own message", async () => {
    const { ValidationError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session());
    mockCreateCardDavToken.mockRejectedValue(new ValidationError({}));

    const { createCardDavTokenAction } = await importActions();

    expect(await createCardDavTokenAction("member-id", { label: "" })).toEqual({
      success: false,
      error: "Érvénytelen eszköznév",
    });
  });
});

describe("revokeCardDavTokenAction", () => {
  it("refuses an unauthenticated caller without reaching the service", async () => {
    mockGetSession.mockResolvedValue(null);

    const { revokeCardDavTokenAction } = await importActions();

    expect(await revokeCardDavTokenAction("token-id", "member-id")).toEqual({
      success: false,
      error: "Jogosulatlan hozzáférés",
    });
    expect(mockRevokeCardDavToken).not.toHaveBeenCalled();
  });

  it("revokes and revalidates the member's page", async () => {
    mockGetSession.mockResolvedValue(session());
    mockRevokeCardDavToken.mockResolvedValue(undefined);

    const { revokeCardDavTokenAction } = await importActions();

    expect(await revokeCardDavTokenAction("token-id", "member-id")).toEqual({
      success: true,
      data: null,
    });
    expect(mockRevokeCardDavToken).toHaveBeenCalledWith(
      {},
      { id: "member-id", role: "MEMBER" },
      "token-id",
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/members/member-id");
  });

  it("maps an unknown token", async () => {
    const { NotFoundError } = await import("@/lib/errors");
    mockGetSession.mockResolvedValue(session());
    mockRevokeCardDavToken.mockRejectedValue(new NotFoundError());

    const { revokeCardDavTokenAction } = await importActions();

    expect(await revokeCardDavTokenAction("gone", "member-id")).toEqual({
      success: false,
      error: "Nem található",
    });
  });
});
