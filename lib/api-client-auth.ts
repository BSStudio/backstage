import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { authentikIssuer } from "@/lib/authentik/issuer";

export interface ApiClient {
  sub: string;
  username: string;
}

function getConfig() {
  const issuer = authentikIssuer();
  const audience = process.env.AUTHENTIK_CLIENT_ID;
  const group = process.env.AUTHENTIK_GROUP_API_CLIENTS;
  if (!issuer || !audience || !group) {
    throw new Error(
      "Missing AUTHENTIK_ISSUER, AUTHENTIK_CLIENT_ID or AUTHENTIK_GROUP_API_CLIENTS environment variables",
    );
  }
  return { issuer, audience, group };
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(issuer: string) {
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/jwks/`));
    jwksCache.set(issuer, jwks);
  }
  return jwks;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

export async function requireApiClient(
  req: Request,
): Promise<ApiClient | NextResponse> {
  const { issuer, audience, group } = getConfig();

  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return unauthorized();

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getJwks(issuer), {
      issuer: [issuer, `${issuer}/`],
      audience,
    }));
  } catch {
    return unauthorized();
  }

  if (!payload.sub) return unauthorized();

  const groups = Array.isArray(payload.groups) ? payload.groups : [];
  if (!groups.includes(group)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    sub: payload.sub,
    username:
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : payload.sub,
  };
}
