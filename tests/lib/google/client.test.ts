import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const SERVICE_ACCOUNT_KEY = Buffer.from(
  JSON.stringify({
    client_email: "backstage@project.iam.gserviceaccount.com",
    private_key: privateKey,
  }),
).toString("base64");

const mockFetch = vi.fn();

function tokenResponse(expiresIn = 3600) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ access_token: "token-abc", expires_in: expiresIn }),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

async function importClient() {
  vi.resetModules();
  return import("@/lib/google/client");
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv("GOOGLE_GROUP_EMAIL", "members@example.com");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", SERVICE_ACCOUNT_KEY);
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isGoogleGroupConfigured", () => {
  it("is true when both variables are set", async () => {
    const { isGoogleGroupConfigured } = await importClient();
    expect(isGoogleGroupConfigured()).toBe(true);
  });

  it("is false when the key is missing", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");
    const { isGoogleGroupConfigured } = await importClient();
    expect(isGoogleGroupConfigured()).toBe(false);
  });

  it("is false when the group email is missing", async () => {
    vi.stubEnv("GOOGLE_GROUP_EMAIL", "");
    const { isGoogleGroupConfigured } = await importClient();
    expect(isGoogleGroupConfigured()).toBe(false);
  });
});

describe("getGroupEmail", () => {
  it("returns the configured group", async () => {
    const { getGroupEmail } = await importClient();
    expect(getGroupEmail()).toBe("members@example.com");
  });

  it("throws when unset", async () => {
    vi.stubEnv("GOOGLE_GROUP_EMAIL", "");
    const { getGroupEmail } = await importClient();
    expect(() => getGroupEmail()).toThrow("Missing GOOGLE_GROUP_EMAIL");
  });
});

describe("getServiceAccountEmail", () => {
  it("returns the client_email from the key", async () => {
    const { getServiceAccountEmail } = await importClient();
    expect(getServiceAccountEmail()).toBe(
      "backstage@project.iam.gserviceaccount.com",
    );
  });
});

describe("googleRequest", () => {
  it("throws when the service account key is missing", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");
    const { googleRequest } = await importClient();
    await expect(googleRequest("/groups:lookup")).rejects.toThrow(
      "Missing GOOGLE_SERVICE_ACCOUNT_KEY",
    );
  });

  it("throws when the key is not base64-encoded JSON", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "not-base64-json");
    const { googleRequest } = await importClient();
    await expect(googleRequest("/groups:lookup")).rejects.toThrow(
      "not base64-encoded JSON",
    );
  });

  it("throws when the key lacks client_email or private_key", async () => {
    vi.stubEnv(
      "GOOGLE_SERVICE_ACCOUNT_KEY",
      Buffer.from(JSON.stringify({ client_email: "a@b.c" })).toString("base64"),
    );
    const { googleRequest } = await importClient();
    await expect(googleRequest("/groups:lookup")).rejects.toThrow(
      "missing client_email or private_key",
    );
  });

  it("mints a JWT-bearer token and calls the API with it", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ name: "groups/1" }));

    const { googleRequest, GOOGLE_SCOPE_READONLY } = await importClient();
    await expect(googleRequest("/groups:lookup")).resolves.toEqual({
      name: "groups/1",
    });

    const [tokenUrl, tokenInit] = mockFetch.mock.calls[0];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    const params = tokenInit.body as URLSearchParams;
    expect(params.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    const claims = JSON.parse(
      Buffer.from(
        (params.get("assertion") as string).split(".")[1],
        "base64url",
      ).toString(),
    );
    expect(claims).toMatchObject({
      scope: GOOGLE_SCOPE_READONLY,
      iss: "backstage@project.iam.gserviceaccount.com",
      aud: "https://oauth2.googleapis.com/token",
    });

    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://cloudidentity.googleapis.com/v1/groups:lookup",
    );
    expect(mockFetch.mock.calls[1][1].headers).toMatchObject({
      Authorization: "Bearer token-abc",
      "Content-Type": "application/json",
    });
  });

  it("requests the write scope when asked for it", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({}));

    const { googleRequest, GOOGLE_SCOPE_WRITE } = await importClient();
    await googleRequest("/groups/1/memberships", {
      method: "POST",
      scope: GOOGLE_SCOPE_WRITE,
    });

    const params = mockFetch.mock.calls[0][1].body as URLSearchParams;
    const claims = JSON.parse(
      Buffer.from(
        (params.get("assertion") as string).split(".")[1],
        "base64url",
      ).toString(),
    );
    expect(claims.scope).toBe(GOOGLE_SCOPE_WRITE);
    expect(mockFetch.mock.calls[1][1].method).toBe("POST");
  });

  it("reuses a cached token for the same scope", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValue(jsonResponse({}));

    const { googleRequest } = await importClient();
    await googleRequest("/groups:lookup");
    await googleRequest("/groups:lookup");

    const tokenCalls = mockFetch.mock.calls.filter(
      ([url]) => url === "https://oauth2.googleapis.com/token",
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("mints a fresh token once the cached one has expired", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse(0))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(tokenResponse(0))
      .mockResolvedValueOnce(jsonResponse({}));

    const { googleRequest } = await importClient();
    await googleRequest("/groups:lookup");
    await googleRequest("/groups:lookup");

    const tokenCalls = mockFetch.mock.calls.filter(
      ([url]) => url === "https://oauth2.googleapis.com/token",
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it("wraps a token endpoint failure in GoogleApiError", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error_description: "bad key" }, 400),
    );

    const { googleRequest, GoogleApiError } = await importClient();
    await expect(googleRequest("/groups:lookup")).rejects.toBeInstanceOf(
      GoogleApiError,
    );
  });

  it("wraps a token endpoint failure whose body is not JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.reject(new Error("not json")),
    });

    const { googleRequest } = await importClient();
    await expect(googleRequest("/groups:lookup")).rejects.toThrow(
      "Google API error: HTTP 401",
    );
  });

  it("wraps an API failure, surfacing the Google error message", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Permission denied" } }, 403),
      );

    const { googleRequest, GoogleApiError } = await importClient();
    const request = googleRequest("/groups:lookup");
    await expect(request).rejects.toBeInstanceOf(GoogleApiError);
    await expect(request).rejects.toMatchObject({
      status: 403,
      message: "Google API error: Permission denied",
    });
  });

  it("falls back to the status code when the body carries no message", async () => {
    mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });

    const { googleRequest } = await importClient();
    await expect(googleRequest("/groups:lookup")).rejects.toThrow(
      "Google API error: HTTP 500",
    );
  });
});
