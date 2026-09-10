import type { MembershipStatus } from "@/app/generated/prisma/client";

/** Idempotency key. */
const DELIVERY_ID_HEADER = "x-bss-delivery-id";

export class WebsiteWebhookError extends Error {
  constructor(
    public status: number,
    body: unknown,
  ) {
    super(`Website webhook error: ${describe(status, body)}`);
    this.name = "WebsiteWebhookError";
  }
}

// `problems` names every bad field at once, in Hungarian — worth more than the status.
function describe(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const { problems, message } = body as {
      problems?: unknown;
      message?: unknown;
    };
    if (Array.isArray(problems) && problems.length > 0) {
      return problems.join("; ");
    }
    if (typeof message === "string" && message !== "") return message;
  }
  return `HTTP ${status}`;
}

export interface WebsiteMember {
  /** The Authentik `sub`, which is our own `Member.id`. */
  sub: string;
  fullName: string;
  nickname: string | null;
  avatarUrl: string | null;
  membershipStatus: MembershipStatus;
  isLeadership: boolean;
  joinedSemester: string | null;
}

export type WebsiteOperation =
  | { op: "upsert"; member: WebsiteMember }
  | { op: "archive"; sub: string };

export type WebsitePushPayload =
  | { operations: WebsiteOperation[] }
  | { mode: "replace"; members: WebsiteMember[] };

export interface WebsiteIngestResult {
  mode: "operations" | "replace";
  operationCount: number;
  created: number;
  updated: number;
  archived: number;
  restored: number;
  unchanged: number;
  ignored: number;
}

export interface WebsitePushResponse {
  ok: true;
  duplicate: boolean;
  deliveryId?: string | null;
  result?: WebsiteIngestResult;
  message?: string;
}

function getConfig() {
  const url = process.env.WEBSITE_WEBHOOK_URL;
  const token = process.env.WEBSITE_WEBHOOK_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing WEBSITE_WEBHOOK_URL or WEBSITE_WEBHOOK_TOKEN environment variables",
    );
  }
  return { url, token };
}

export function isWebsiteWebhookConfigured(): boolean {
  return Boolean(
    process.env.WEBSITE_WEBHOOK_URL && process.env.WEBSITE_WEBHOOK_TOKEN,
  );
}

// `deliveryId` is the SyncJob id, so a retry of a push that landed but never answered
// comes back as a duplicate instead of applying twice.
export async function pushMembers(
  payload: WebsitePushPayload,
  deliveryId: string,
): Promise<WebsitePushResponse> {
  const { url, token } = getConfig();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      [DELIVERY_ID_HEADER]: deliveryId,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new WebsiteWebhookError(res.status, body);
  if (!body || typeof body !== "object") {
    throw new WebsiteWebhookError(res.status, {
      message: "Response was not JSON",
    });
  }
  return body as WebsitePushResponse;
}
