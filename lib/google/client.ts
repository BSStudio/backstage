import { importPKCS8, SignJWT } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://cloudidentity.googleapis.com/v1";

export const GOOGLE_SCOPE_READONLY =
  "https://www.googleapis.com/auth/cloud-identity.groups.readonly";
export const GOOGLE_SCOPE_WRITE =
  "https://www.googleapis.com/auth/cloud-identity.groups";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error
        ? String((body.error as { message: unknown }).message)
        : `HTTP ${status}`;
    super(`Google API error: ${message}`);
    this.name = "GoogleApiError";
  }
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export function isGoogleGroupConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_GROUP_EMAIL,
  );
}

export function getGroupEmail(): string {
  const groupEmail = process.env.GOOGLE_GROUP_EMAIL;
  if (!groupEmail) {
    throw new Error("Missing GOOGLE_GROUP_EMAIL environment variable");
  }
  return groupEmail;
}

function getServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY environment variable");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not base64-encoded JSON");
  }

  const key = parsed as Partial<ServiceAccountKey> | null;
  if (!key?.client_email || !key?.private_key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email or private_key",
    );
  }
  return key as ServiceAccountKey;
}

// Cached per scope, so a read path never carries a token that could write.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const EXPIRY_SKEW_MS = 60_000;

async function getAccessToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const key = getServiceAccountKey();
  const privateKey = await importPKCS8(key.private_key, "RS256");
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(key.client_email)
    .setSubject(key.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleApiError(res.status, body);

  const { access_token, expires_in } = body as {
    access_token: string;
    expires_in: number;
  };
  tokenCache.set(scope, {
    token: access_token,
    expiresAt: Date.now() + expires_in * 1000 - EXPIRY_SKEW_MS,
  });
  return access_token;
}

export async function googleRequest<T>(
  path: string,
  options: RequestInit & { scope?: string } = {},
): Promise<T> {
  const { scope = GOOGLE_SCOPE_READONLY, ...init } = options;
  const token = await getAccessToken(scope);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleApiError(res.status, body);
  return body as T;
}
