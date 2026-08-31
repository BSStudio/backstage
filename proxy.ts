import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isCardDavPath, isDavMethod } from "@/lib/carddav/paths";

const publicPaths = [
  "/api/auth",
  "/api/health",
  "/api/usernames",
  "/login",
  "/monitoring",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Next answers 405 to PROPFIND and REPORT before a route handler runs, so the proxy is
  // the only place that sees them. The dynamic import keeps Prisma and the vCard layer out
  // of the module graph every other request pays for.
  if (isCardDavPath(pathname) || isDavMethod(request.method)) {
    const { handleCardDav } = await import("@/lib/carddav/handler");
    return handleCardDav(request);
  }

  // Reinstates what `skipTrailingSlashRedirect` turned off for CardDAV's sake.
  if (pathname !== "/" && pathname.endsWith("/")) {
    // Not `nextUrl.clone()`: NextURL puts the trailing slash back on serialisation, so
    // the redirect pointed at itself.
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(url, 308);
  }

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    // Only a browser navigation can act on a redirect. Anything else — an API fetch, a
    // Server Action POST, a phone probing for a collection — resolves with the login HTML
    // under a 200 and cannot tell that apart from a real answer.
    const isNavigation = request.method === "GET" || request.method === "HEAD";
    if (pathname.startsWith("/api/") || !isNavigation) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.ico$).*)",
  ],
};
