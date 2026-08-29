import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionCookie } = vi.hoisted(() => ({
  mockGetSessionCookie: vi.fn(),
}));

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: mockGetSessionCookie,
}));

import { proxy } from "@/proxy";

function request(pathname: string): NextRequest {
  const url = new URL(pathname, "https://backstage.test");
  return { nextUrl: url, url: url.toString() } as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxy", () => {
  it("lets public paths through without looking at the cookie", () => {
    const response = proxy(request("/api/health"));

    expect(response.status).toBe(200);
    expect(mockGetSessionCookie).not.toHaveBeenCalled();
  });

  it("lets an authenticated request through", () => {
    mockGetSessionCookie.mockReturnValue("a-session-token");

    const response = proxy(request("/members"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers an unauthenticated API request with 401 JSON", async () => {
    mockGetSessionCookie.mockReturnValue(null);

    const response = proxy(request("/api/members"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("redirects an unauthenticated page request, keeping the path", () => {
    mockGetSessionCookie.mockReturnValue(null);

    const response = proxy(request("/members/abc"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/members/abc");
  });

  it("omits callbackUrl when the request was for the root", () => {
    mockGetSessionCookie.mockReturnValue(null);

    const response = proxy(request("/"));

    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.has("callbackUrl")).toBe(false);
  });
});
