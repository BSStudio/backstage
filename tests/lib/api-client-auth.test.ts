import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateRemoteJWKSet } = vi.hoisted(() => ({
  mockCreateRemoteJWKSet: vi.fn(),
}));

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: mockCreateRemoteJWKSet };
});

import { type JWTPayload, SignJWT } from "jose";
import { NextResponse } from "next/server";
import { requireApiClient } from "@/lib/api-client-auth";

const ISSUER = "https://auth.example.com/application/o/backstage";
const AUDIENCE = "backstage-client-id";
const GROUP = "backstage-api-clients";

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let foreignPrivateKey: CryptoKey;

beforeAll(async () => {
  const jose = await vi.importActual<typeof import("jose")>("jose");
  ({ privateKey, publicKey } = await jose.generateKeyPair("RS256"));
  ({ privateKey: foreignPrivateKey } = await jose.generateKeyPair("RS256"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRemoteJWKSet.mockImplementation(() => async () => publicKey);

  vi.stubEnv("AUTHENTIK_ISSUER", ISSUER);
  vi.stubEnv("AUTHENTIK_CLIENT_ID", AUDIENCE);
  vi.stubEnv("AUTHENTIK_GROUP_API_CLIENTS", GROUP);
});

async function sign(
  payload: JWTPayload,
  options: { issuer?: string; audience?: string; key?: CryptoKey } = {},
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(options.key ?? privateKey);
}

function req(token?: string, scheme = "Bearer") {
  return new Request("http://localhost/api/usernames/suggest", {
    headers: token ? { authorization: `${scheme} ${token}` } : {},
  });
}

async function status(result: unknown) {
  return (result as NextResponse).status;
}

// ─── configuration ───────────────────────────────────────────────────────────

describe("requireApiClient configuration", () => {
  it("throws when the API client group is not configured", async () => {
    vi.stubEnv("AUTHENTIK_GROUP_API_CLIENTS", "");

    await expect(
      requireApiClient(req(await sign({ sub: "x" }))),
    ).rejects.toThrow("Missing AUTHENTIK_ISSUER");
  });

  it("throws when the issuer is not configured", async () => {
    vi.stubEnv("AUTHENTIK_ISSUER", "");

    await expect(requireApiClient(req("token"))).rejects.toThrow(
      "Missing AUTHENTIK_ISSUER",
    );
  });

  it("throws when the audience is not configured", async () => {
    vi.stubEnv("AUTHENTIK_CLIENT_ID", "");

    await expect(requireApiClient(req("token"))).rejects.toThrow(
      "Missing AUTHENTIK_ISSUER",
    );
  });
});

// ─── rejection paths ─────────────────────────────────────────────────────────

describe("requireApiClient rejections", () => {
  it("returns 401 without an Authorization header", async () => {
    const result = await requireApiClient(req());

    expect(result).toBeInstanceOf(NextResponse);
    expect(await status(result)).toBe(401);
    expect((result as NextResponse).headers.get("WWW-Authenticate")).toBe(
      "Bearer",
    );
  });

  it("returns 401 for a non-bearer scheme", async () => {
    const result = await requireApiClient(req("dXNlcjpwYXNz", "Basic"));

    expect(await status(result)).toBe(401);
  });

  it("returns 401 for a token signed by an unknown key", async () => {
    const token = await sign(
      { sub: "svc-1", groups: [GROUP] },
      { key: foreignPrivateKey },
    );

    expect(await status(await requireApiClient(req(token)))).toBe(401);
  });

  it("returns 401 for a wrong audience", async () => {
    const token = await sign(
      { sub: "svc-1", groups: [GROUP] },
      { audience: "some-other-app" },
    );

    expect(await status(await requireApiClient(req(token)))).toBe(401);
  });

  it("returns 401 for a wrong issuer", async () => {
    const token = await sign(
      { sub: "svc-1", groups: [GROUP] },
      { issuer: "https://evil.example.com" },
    );

    expect(await status(await requireApiClient(req(token)))).toBe(401);
  });

  it("returns 401 for a token without a subject", async () => {
    const token = await sign({ groups: [GROUP] });

    expect(await status(await requireApiClient(req(token)))).toBe(401);
  });

  it("returns 403 when the API client group is missing from the claim", async () => {
    const token = await sign({ sub: "svc-1", groups: ["some-other-group"] });

    expect(await status(await requireApiClient(req(token)))).toBe(403);
  });

  it("returns 403 when there is no groups claim at all", async () => {
    const token = await sign({ sub: "svc-1" });

    expect(await status(await requireApiClient(req(token)))).toBe(403);
  });
});

// ─── success paths ───────────────────────────────────────────────────────────

describe("requireApiClient acceptance", () => {
  it("returns the caller identity for a valid token", async () => {
    const token = await sign({
      sub: "svc-1",
      groups: [GROUP],
      preferred_username: "ak-requests",
    });

    expect(await requireApiClient(req(token))).toEqual({
      sub: "svc-1",
      username: "ak-requests",
    });
  });

  it("falls back to the subject when preferred_username is absent", async () => {
    const token = await sign({ sub: "svc-1", groups: [GROUP] });

    expect(await requireApiClient(req(token))).toEqual({
      sub: "svc-1",
      username: "svc-1",
    });
  });

  it("accepts a trailing slash on either side of the issuer comparison", async () => {
    vi.stubEnv("AUTHENTIK_ISSUER", `${ISSUER}/`);
    const token = await sign({ sub: "svc-1", groups: [GROUP] });

    expect(await requireApiClient(req(token))).toEqual({
      sub: "svc-1",
      username: "svc-1",
    });

    const slashed = await sign(
      { sub: "svc-1", groups: [GROUP] },
      { issuer: `${ISSUER}/` },
    );
    expect(await requireApiClient(req(slashed))).toEqual({
      sub: "svc-1",
      username: "svc-1",
    });
  });

  it("builds the remote JWKS once per issuer", async () => {
    const issuer = "https://auth.example.com/application/o/memoized";
    vi.stubEnv("AUTHENTIK_ISSUER", issuer);
    const token = await sign({ sub: "svc-1", groups: [GROUP] }, { issuer });

    await requireApiClient(req(token));
    await requireApiClient(req(token));

    expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(1);
    expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
      new URL(`${issuer}/jwks/`),
    );
  });
});
