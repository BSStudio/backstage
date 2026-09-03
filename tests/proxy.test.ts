import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionCookie, mockHandleCardDav } = vi.hoisted(() => ({
  mockGetSessionCookie: vi.fn(),
  mockHandleCardDav: vi.fn(),
}));

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: mockGetSessionCookie,
}));

// The handler reaches Prisma and the whole vCard layer; the proxy's job here is only to
// route to it.
vi.mock("@/lib/carddav/handler", () => ({
  handleCardDav: mockHandleCardDav,
}));

import { proxy } from "@/proxy";

function request(pathname: string, method = "GET"): NextRequest {
  const url = new URL(pathname, "https://backstage.test");
  return { nextUrl: url, url: url.toString(), method } as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHandleCardDav.mockResolvedValue(new NextResponse(null, { status: 207 }));
});

describe("proxy", () => {
  it("lets public paths through without looking at the cookie", async () => {
    const response = await proxy(request("/api/health"));

    expect(response.status).toBe(200);
    expect(mockGetSessionCookie).not.toHaveBeenCalled();
  });

  // The agent carries a bearer token instead of a session cookie; the route authenticates
  // it itself.
  it("lets the computer endpoints past the cookie check", async () => {
    const response = await proxy(request("/api/computers/nle4/ping", "POST"));

    expect(response.status).toBe(200);
    expect(mockGetSessionCookie).not.toHaveBeenCalled();
  });

  it("lets an authenticated request through", async () => {
    mockGetSessionCookie.mockReturnValue("a-session-token");

    const response = await proxy(request("/members"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers an unauthenticated API request with 401 JSON", async () => {
    mockGetSessionCookie.mockReturnValue(null);

    const response = await proxy(request("/api/members"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("answers an unauthenticated non-navigation request with 401, not login HTML", async () => {
    mockGetSessionCookie.mockReturnValue(null);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await proxy(request("/members/abc", method));

      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("sends a WebDAV verb to the handler wherever it is aimed", async () => {
    mockGetSessionCookie.mockReturnValue(null);

    for (const method of ["PROPFIND", "REPORT", "PROPPATCH", "MKCOL"]) {
      expect((await proxy(request("/", method))).status).toBe(207);
    }

    expect(mockHandleCardDav).toHaveBeenCalledTimes(4);
  });

  it("redirects an unauthenticated page request, keeping the path", async () => {
    mockGetSessionCookie.mockReturnValue(null);

    const response = await proxy(request("/members/abc"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/members/abc");
  });

  it("hands every CardDAV path to the handler, cookie or not", async () => {
    for (const path of [
      "/api/carddav",
      "/api/carddav/",
      "/api/carddav/addressbook/abc.vcf",
      "/.well-known/carddav",
      "/principals",
      "/principals/users/someone/",
    ]) {
      expect((await proxy(request(path))).status).toBe(207);
    }

    expect(mockHandleCardDav).toHaveBeenCalledTimes(6);
    expect(mockGetSessionCookie).not.toHaveBeenCalled();
  });

  it("leaves a path that merely starts the same alone", async () => {
    mockGetSessionCookie.mockReturnValue("a-session-token");

    await proxy(request("/api/carddavish"));
    await proxy(request("/principalsomething"));

    expect(mockHandleCardDav).not.toHaveBeenCalled();
  });

  it("redirects a trailing slash away, which Next no longer does itself", async () => {
    mockGetSessionCookie.mockReturnValue("a-session-token");

    const response = await proxy(request("/members/"));

    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location") as string).pathname).toBe(
      "/members",
    );
  });

  it("leaves the root alone, which is a trailing slash of its own", async () => {
    mockGetSessionCookie.mockReturnValue("a-session-token");

    const response = await proxy(request("/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("omits callbackUrl when the request was for the root", async () => {
    mockGetSessionCookie.mockReturnValue(null);

    const response = await proxy(request("/"));

    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.has("callbackUrl")).toBe(false);
  });
});
