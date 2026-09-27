import { requestTimeout, transportFailure } from "@/lib/http";
import { CloudflareError, cloudflareAuth } from "./client";

const API_BASE = "https://api.cloudflare.com/client/v4";

// The name is interpolated into SQL, so it is checked rather than trusted.
const DATASET_PATTERN = /^[A-Za-z0-9_]+$/;

const WINDOW_DAYS = 30;

export const CLICK_WINDOW_DAYS = WINDOW_DAYS;

export function analyticsDataset(): string | null {
  const dataset = process.env.CLOUDFLARE_ANALYTICS_DATASET?.trim();
  if (!dataset) return null;
  if (!DATASET_PATTERN.test(dataset)) {
    throw new Error(`Invalid CLOUDFLARE_ANALYTICS_DATASET: ${dataset}`);
  }
  return dataset;
}

interface SqlResponse {
  data?: { slug?: string; clicks?: string | number }[];
}

export async function readShortLinkClicks(): Promise<Record<string, number>> {
  const dataset = analyticsDataset();
  if (!dataset) return {};

  const { accountId, token } = cloudflareAuth();
  // SUM(_sample_interval), not COUNT(): Analytics Engine downsamples and a count under-reports.
  const sql = `SELECT index1 AS slug, SUM(_sample_interval) AS clicks FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '${WINDOW_DAYS}' DAY GROUP BY index1 FORMAT JSON`;

  const res = await fetch(
    `${API_BASE}/accounts/${accountId}/analytics_engine/sql`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: sql,
      signal: requestTimeout(),
    },
  ).catch((error) => {
    throw new CloudflareError(0, { message: transportFailure(error) });
  });

  const body = (await res.json().catch(() => null)) as SqlResponse | null;
  if (!res.ok) throw new CloudflareError(res.status, body);
  if (!body || typeof body !== "object") {
    throw new CloudflareError(res.status, { message: "Response was not JSON" });
  }

  const clicks: Record<string, number> = {};
  for (const row of body.data ?? []) {
    if (!row.slug) continue;
    clicks[row.slug] = Number(row.clicks ?? 0);
  }
  return clicks;
}
