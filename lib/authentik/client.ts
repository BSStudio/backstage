export class AuthentikError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${status}`;
    super(`Authentik API error: ${detail}`);
    this.name = "AuthentikError";
  }
}

function getConfig() {
  const baseUrl = process.env.AUTHENTIK_URL;
  const token = process.env.AUTHENTIK_API_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "Missing AUTHENTIK_URL or AUTHENTIK_API_TOKEN environment variables",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

export async function authentikRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const { baseUrl, token } = getConfig();

  const res = await fetch(`${baseUrl}/api/v3${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new AuthentikError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
