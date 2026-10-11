import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAuthApi } from "../helpers";

const mockGetSession = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockPublish = vi.fn();
const mockRepublish = vi.fn();
const mockRevalidatePath = vi.fn();
const mockCaptureServiceError = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockGetSession.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockPublish.mockReset();
  mockRepublish.mockReset();
  mockRevalidatePath.mockReset();
  mockCaptureServiceError.mockReset();

  mockAuthApi(mockGetSession);
  vi.doMock("@/lib/prisma", () => ({ default: {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
  vi.doMock("@/lib/observability/capture", () => ({
    captureServiceError: mockCaptureServiceError,
  }));
  vi.doMock(
    "@/lib/services/short-links",
    (): typeof import("@/lib/services/short-links") => ({
      createShortLink: mockCreate,
      updateShortLink: mockUpdate,
      deleteShortLink: mockDelete,
      publishShortLink: mockPublish,
      republishShortLinks: mockRepublish,
      listShortLinks: vi.fn(),
      getShortLinkClicks: vi.fn(),
      createShortLinkSchema: vi.fn(),
      updateShortLinkSchema: vi.fn(),
      shortLinkFormSchema: vi.fn(),
    }),
  );
});

function session(role: string) {
  return { user: { id: "actor-id", role } };
}

const FORBIDDEN = { success: false, error: "Hozzáférés megtagadva" };

async function actions() {
  return import("@/lib/actions/short-links");
}

const LINK = { slug: "promo", url: "https://bsstudio.hu/a" };

describe("createShortLinkAction", () => {
  it("refuses an anonymous caller without reaching the service", async () => {
    mockGetSession.mockResolvedValue(null);

    const { createShortLinkAction } = await actions();

    expect(await createShortLinkAction(LINK)).toEqual(FORBIDDEN);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses an ordinary member", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));

    const { createShortLinkAction } = await actions();

    expect(await createShortLinkAction(LINK)).toEqual(FORBIDDEN);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each(["LEADER", "ADMIN"])("allows a %s", async (role) => {
    mockGetSession.mockResolvedValue(session(role));
    mockCreate.mockResolvedValue({ link: LINK, syncErrors: [] });

    const { createShortLinkAction } = await actions();

    expect(await createShortLinkAction(LINK)).toEqual({
      success: true,
      data: { slug: "promo" },
      syncErrors: [],
    });
    expect(mockCreate).toHaveBeenCalledWith({}, LINK, {
      id: "actor-id",
      role,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/short-links");
  });

  it("passes a publish failure back as a sync error", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockCreate.mockResolvedValue({
      link: LINK,
      syncErrors: ["Cloudflare API error: Too many requests"],
    });

    const { createShortLinkAction } = await actions();

    expect(await createShortLinkAction(LINK)).toEqual({
      success: true,
      data: { slug: "promo" },
      syncErrors: ["Cloudflare API error: Too many requests"],
    });
  });

  it("maps a validation failure to the Hungarian message", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    const { ValidationError } = await import("@/lib/errors");
    mockCreate.mockRejectedValue(new ValidationError({}));

    const { createShortLinkAction } = await actions();

    expect(await createShortLinkAction(LINK)).toEqual({
      success: false,
      error: "Érvénytelen linkadatok",
    });
  });
});

describe("updateShortLinkAction", () => {
  it("refuses an ordinary member", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));

    const { updateShortLinkAction } = await actions();

    expect(await updateShortLinkAction("promo", {})).toEqual(FORBIDDEN);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("forwards the slug, the payload and the actor", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockUpdate.mockResolvedValue({ link: LINK, syncErrors: [] });

    const { updateShortLinkAction } = await actions();

    expect(
      await updateShortLinkAction("promo", { url: "https://bsstudio.hu/b" }),
    ).toEqual({ success: true, data: { slug: "promo" }, syncErrors: [] });
    expect(mockUpdate).toHaveBeenCalledWith(
      {},
      "promo",
      { url: "https://bsstudio.hu/b" },
      { id: "actor-id", role: "LEADER" },
    );
  });

  it("maps a missing link to the Hungarian message", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    const { NotFoundError } = await import("@/lib/errors");
    mockUpdate.mockRejectedValue(new NotFoundError());

    const { updateShortLinkAction } = await actions();

    expect(await updateShortLinkAction("nope", {})).toEqual({
      success: false,
      error: "Nem található",
    });
  });
});

describe("deleteShortLinkAction", () => {
  it("refuses an ordinary member", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));

    const { deleteShortLinkAction } = await actions();

    expect(await deleteShortLinkAction("promo")).toEqual(FORBIDDEN);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("answers with no payload and the sync errors", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockDelete.mockResolvedValue({ deleted: true, syncErrors: ["Upstream"] });

    const { deleteShortLinkAction } = await actions();

    expect(await deleteShortLinkAction("promo")).toEqual({
      success: true,
      data: null,
      syncErrors: ["Upstream"],
    });
  });

  it("maps a missing link to the Hungarian message", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    const { NotFoundError } = await import("@/lib/errors");
    mockDelete.mockRejectedValue(new NotFoundError());

    const { deleteShortLinkAction } = await actions();

    expect(await deleteShortLinkAction("nope")).toEqual({
      success: false,
      error: "Nem található",
    });
  });
});

describe("publishShortLinkAction", () => {
  it("refuses an ordinary member", async () => {
    mockGetSession.mockResolvedValue(session("MEMBER"));

    const { publishShortLinkAction } = await actions();

    expect(await publishShortLinkAction("promo")).toEqual(FORBIDDEN);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("allows a leader to push again", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));
    mockPublish.mockResolvedValue({ link: LINK, syncErrors: [] });

    const { publishShortLinkAction } = await actions();

    expect(await publishShortLinkAction("promo")).toEqual({
      success: true,
      data: { slug: "promo" },
      syncErrors: [],
    });
  });

  it("maps a missing link to the Hungarian message", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    const { NotFoundError } = await import("@/lib/errors");
    mockPublish.mockRejectedValue(new NotFoundError());

    const { publishShortLinkAction } = await actions();

    expect(await publishShortLinkAction("nope")).toEqual({
      success: false,
      error: "Nem található",
    });
  });
});

describe("republishShortLinksAction", () => {
  it("refuses a leader, unlike the other actions", async () => {
    mockGetSession.mockResolvedValue(session("LEADER"));

    const { republishShortLinksAction } = await actions();

    expect(await republishShortLinksAction()).toEqual(FORBIDDEN);
    expect(mockRepublish).not.toHaveBeenCalled();
  });

  it("returns the counts and revalidates the audit log", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    mockRepublish.mockResolvedValue({ links: 4, removed: 1 });

    const { republishShortLinksAction } = await actions();

    expect(await republishShortLinksAction()).toEqual({
      success: true,
      data: { links: 4, removed: 1 },
      syncErrors: [],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/audit");
  });

  it("surfaces a Cloudflare refusal verbatim and reports it", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    const { CloudflareError } = await import("@/lib/cloudflare/client");
    const refusal = new CloudflareError(403, { message: "Forbidden by token" });
    mockRepublish.mockRejectedValue(refusal);

    const { republishShortLinksAction } = await actions();

    expect(await republishShortLinksAction()).toEqual({
      success: false,
      error: "Cloudflare API error: Forbidden by token",
    });
    expect(mockCaptureServiceError).toHaveBeenCalledWith(refusal);
  });

  it("maps an unconfigured deployment to the Hungarian message", async () => {
    mockGetSession.mockResolvedValue(session("ADMIN"));
    const { ValidationError } = await import("@/lib/errors");
    mockRepublish.mockRejectedValue(new ValidationError({}));

    const { republishShortLinksAction } = await actions();

    expect(await republishShortLinksAction()).toEqual({
      success: false,
      error: "A rövid linkek publikálása nincs beállítva",
    });
  });
});
