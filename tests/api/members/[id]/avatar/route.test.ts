import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNoSession, mockSession } from "../../../../helpers";
import { getTestPrisma, mockPrisma } from "../../../../setup";

const ACTOR_ID = "test-actor-id";
const MEMBER_ID = "test-member-id";

const { mockSaveAvatar, mockDeleteAvatars } = vi.hoisted(() => ({
  mockSaveAvatar: vi.fn((_id: string, variant: string) =>
    Promise.resolve(`/avatars/${_id}-${variant}.webp`),
  ),
  mockDeleteAvatars: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/avatar-storage", () => ({
  saveAvatar: mockSaveAvatar,
  deleteAvatars: mockDeleteAvatars,
}));

function mockOrchestratorsSuccess() {
  vi.doMock("@/lib/sync/authentik/orchestrators", () => ({
    createAuthentikUser: vi.fn(),
    orchestrateDeactivate: vi.fn(),
    orchestrateUpdateAttributes: vi.fn(async () => ({
      success: true,
      result: null,
    })),
    orchestrateStatusChange: vi.fn(async () => []),
    orchestrateAddToGroup: vi.fn(),
    orchestrateRemoveFromGroup: vi.fn(),
    buildAuthentikAttributes: (m: {
      firstName: string;
      lastName: string;
      mobile: string | null;
      avatarUrl: string | null;
    }) => ({
      first_name: m.firstName,
      last_name: m.lastName,
      ...(m.mobile ? { mobile: m.mobile } : {}),
      ...(m.avatarUrl ? { avatar_url: m.avatarUrl } : {}),
    }),
  }));
}

beforeEach(async () => {
  vi.resetModules();
  mockPrisma();
  mockSaveAvatar.mockClear();
  mockDeleteAvatars.mockClear();
  mockSaveAvatar.mockImplementation((_id: string, variant: string) =>
    Promise.resolve(`/avatars/${_id}-${variant}.webp`),
  );
  mockDeleteAvatars.mockImplementation(() => Promise.resolve());

  const prisma = getTestPrisma();

  await prisma.member.upsert({
    where: { id: ACTOR_ID },
    update: {},
    create: {
      id: ACTOR_ID,
      firstName: "Leader",
      lastName: "Actor",
      email: "actor@test.com",
      joinedSemester: "2025/2026/1",
    },
  });

  await prisma.member.upsert({
    where: { id: MEMBER_ID },
    update: {},
    create: {
      id: MEMBER_ID,
      firstName: "Target",
      lastName: "Member",
      email: "target@test.com",
      joinedSemester: "2025/2026/1",
    },
  });
});

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePostReq(id: string, files?: { square?: Blob; portrait?: Blob }) {
  const formData = new FormData();
  if (files?.square) formData.append("square", files.square, "square.webp");
  if (files?.portrait)
    formData.append("portrait", files.portrait, "portrait.webp");

  return new NextRequest(
    new URL(`/api/members/${id}/avatar`, "http://localhost"),
    { method: "POST", body: formData } as never,
  );
}

function makeDeleteReq(id: string) {
  return new NextRequest(
    new URL(`/api/members/${id}/avatar`, "http://localhost"),
    { method: "DELETE" } as never,
  );
}

const dummyBlob = new Blob(["data"], { type: "image/webp" });

// ─── POST /api/members/[id]/avatar ──────────────────────────────────────────

describe("POST /api/members/[id]/avatar", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob, portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when member tries to upload for another member", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob, portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(403);
  });

  it("allows member to upload own avatar", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    mockOrchestratorsSuccess();
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob, portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatarUrl).toContain(MEMBER_ID);
    expect(body.portraitUrl).toContain(MEMBER_ID);
  });

  it("allows leader to upload for any member", async () => {
    mockSession({ id: ACTOR_ID, role: "LEADER" });
    mockOrchestratorsSuccess();
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob, portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent member", async () => {
    mockSession({ id: ACTOR_ID, role: "ADMIN" });
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq("non-existent", { square: dummyBlob, portrait: dummyBlob }),
      makeParams("non-existent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when square file is missing", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns 400 when portrait file is missing", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when saveAvatar throws", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    mockSaveAvatar.mockRejectedValueOnce(new Error("Invalid image format"));
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob, portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid image format");
  });

  it("updates member record with avatar URLs", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    mockOrchestratorsSuccess();
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob, portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );

    const prisma = getTestPrisma();
    const member = await prisma.member.findUnique({
      where: { id: MEMBER_ID },
    });
    expect(member?.avatarUrl).toContain(MEMBER_ID);
    expect(member?.portraitUrl).toContain(MEMBER_ID);
  });

  it("returns 207 with syncErrors when Authentik attribute sync fails", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    vi.doMock("@/lib/sync/authentik/orchestrators", () => ({
      createAuthentikUser: vi.fn(),
      orchestrateDeactivate: vi.fn(),
      orchestrateUpdateAttributes: vi.fn(async () => ({
        success: false,
        error: "Authentik unreachable",
      })),
      orchestrateStatusChange: vi.fn(async () => []),
      orchestrateAddToGroup: vi.fn(),
      orchestrateRemoveFromGroup: vi.fn(),
      buildAuthentikAttributes: () => ({}),
    }));
    const { POST } = await import("@/app/api/members/[id]/avatar/route");
    const res = await POST(
      makePostReq(MEMBER_ID, { square: dummyBlob, portrait: dummyBlob }),
      makeParams(MEMBER_ID),
    );
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.syncErrors).toEqual(["Authentik unreachable"]);
  });
});

// ─── DELETE /api/members/[id]/avatar ────────────────────────────────────────

describe("DELETE /api/members/[id]/avatar", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const { DELETE } = await import("@/app/api/members/[id]/avatar/route");
    const res = await DELETE(makeDeleteReq(MEMBER_ID), makeParams(MEMBER_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when member tries to delete another member's avatar", async () => {
    mockSession({ id: ACTOR_ID, role: "MEMBER" });
    const { DELETE } = await import("@/app/api/members/[id]/avatar/route");
    const res = await DELETE(makeDeleteReq(MEMBER_ID), makeParams(MEMBER_ID));
    expect(res.status).toBe(403);
  });

  it("allows member to delete own avatar", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    mockOrchestratorsSuccess();
    const { DELETE } = await import("@/app/api/members/[id]/avatar/route");
    const res = await DELETE(makeDeleteReq(MEMBER_ID), makeParams(MEMBER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ avatarUrl: null, portraitUrl: null });
  });

  it("allows admin to delete any member's avatar", async () => {
    mockSession({ id: ACTOR_ID, role: "ADMIN" });
    mockOrchestratorsSuccess();
    const { DELETE } = await import("@/app/api/members/[id]/avatar/route");
    const res = await DELETE(makeDeleteReq(MEMBER_ID), makeParams(MEMBER_ID));
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent member", async () => {
    mockSession({ id: ACTOR_ID, role: "ADMIN" });
    const { DELETE } = await import("@/app/api/members/[id]/avatar/route");
    const res = await DELETE(
      makeDeleteReq("non-existent"),
      makeParams("non-existent"),
    );
    expect(res.status).toBe(404);
  });

  it("calls deleteAvatars and clears DB fields", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    mockOrchestratorsSuccess();

    // Pre-set avatar URLs
    const prisma = getTestPrisma();
    await prisma.member.update({
      where: { id: MEMBER_ID },
      data: {
        avatarUrl: "/avatars/old-square.webp",
        portraitUrl: "/avatars/old-portrait.webp",
      },
    });

    const { DELETE } = await import("@/app/api/members/[id]/avatar/route");
    await DELETE(makeDeleteReq(MEMBER_ID), makeParams(MEMBER_ID));

    expect(mockDeleteAvatars).toHaveBeenCalledWith(MEMBER_ID);

    const member = await prisma.member.findUnique({
      where: { id: MEMBER_ID },
    });
    expect(member?.avatarUrl).toBeNull();
    expect(member?.portraitUrl).toBeNull();
  });

  it("returns 207 with syncErrors when Authentik attribute sync fails", async () => {
    mockSession({ id: MEMBER_ID, role: "MEMBER" });
    vi.doMock("@/lib/sync/authentik/orchestrators", () => ({
      createAuthentikUser: vi.fn(),
      orchestrateDeactivate: vi.fn(),
      orchestrateUpdateAttributes: vi.fn(async () => ({
        success: false,
        error: "Authentik unreachable",
      })),
      orchestrateStatusChange: vi.fn(async () => []),
      orchestrateAddToGroup: vi.fn(),
      orchestrateRemoveFromGroup: vi.fn(),
      buildAuthentikAttributes: () => ({}),
    }));
    const { DELETE } = await import("@/app/api/members/[id]/avatar/route");
    const res = await DELETE(makeDeleteReq(MEMBER_ID), makeParams(MEMBER_ID));
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body).toEqual({
      avatarUrl: null,
      portraitUrl: null,
      syncErrors: ["Authentik unreachable"],
    });
  });
});
