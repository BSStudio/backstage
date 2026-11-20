import { requestTimeout, transportFailure } from "@/lib/http";

const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Cloudflare API error: ${describe(status, body)}`);
    this.name = "CloudflareError";
  }
}

function describe(status: number, body: unknown): string {
  if (!body || typeof body !== "object") return `HTTP ${status}`;
  const { errors, message } = body as { errors?: unknown; message?: unknown };
  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((entry) =>
        entry && typeof entry === "object" && "message" in entry
          ? String((entry as { message: unknown }).message)
          : String(entry),
      )
      .join("; ");
  }
  if (message) return String(message);
  return `HTTP ${status}`;
}

export interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: { code?: number; message?: string }[];
  result: T;
  result_info?: { cursor?: string; count?: number };
}

export function cloudflareAuth(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables",
    );
  }
  return { accountId, token };
}

export function kvNamespaceId(): string {
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  if (!namespaceId) {
    throw new Error("Missing CLOUDFLARE_KV_NAMESPACE_ID environment variable");
  }
  return namespaceId;
}

export function isCloudflareConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_API_TOKEN &&
      process.env.CLOUDFLARE_KV_NAMESPACE_ID,
  );
}

export async function cloudflareRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<CloudflareEnvelope<T>> {
  const { accountId, token } = cloudflareAuth();

  const res = await fetch(`${API_BASE}/accounts/${accountId}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
    signal: requestTimeout(),
  }).catch((error) => {
    throw new CloudflareError(0, { message: transportFailure(error) });
  });

  const body = (await res
    .json()
    .catch(() => null)) as CloudflareEnvelope<T> | null;

  if (!res.ok) throw new CloudflareError(res.status, body);
  if (!body || typeof body !== "object") {
    throw new CloudflareError(res.status, { message: "Response was not JSON" });
  }
  // Cloudflare answers 200 with success:false for a refused operation.
  if (!body.success) throw new CloudflareError(res.status, body);

  return body;
}
