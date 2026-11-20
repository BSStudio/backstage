import { CloudflareError, cloudflareRequest, kvNamespaceId } from "./client";

// The single-key endpoints want multipart; the bulk ones take JSON and accept one entry, so
// every write goes through them and there is one code path to test.
const BULK_LIMIT = 10_000;

export interface KvPair {
  key: string;
  value: string;
}

function namespacePath(suffix: string): string {
  return `/storage/kv/namespaces/${kvNamespaceId()}${suffix}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface BulkResult {
  unsuccessful_keys?: string[];
}

// A successful envelope only means the batch was accepted; the keys it did not apply are listed.
async function bulk(suffix: string, method: string, batch: unknown[]) {
  const { result } = await cloudflareRequest<BulkResult | null>(
    namespacePath(suffix),
    { method, body: JSON.stringify(batch) },
  );
  const failed = result?.unsuccessful_keys ?? [];
  if (failed.length > 0) {
    throw new CloudflareError(200, {
      message: `KV did not apply: ${failed.join(", ")}`,
    });
  }
}

export async function putKvPairs(pairs: KvPair[]): Promise<void> {
  for (const batch of chunk(pairs, BULK_LIMIT)) {
    await bulk("/bulk", "PUT", batch);
  }
}

export async function deleteKvKeys(keys: string[]): Promise<void> {
  for (const batch of chunk(keys, BULK_LIMIT)) {
    await bulk("/bulk/delete", "POST", batch);
  }
}

export async function listKvKeys(): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const { result, result_info } = await cloudflareRequest<{ name: string }[]>(
      namespacePath(`/keys${query}`),
    );
    keys.push(...result.map((entry) => entry.name));
    cursor = result_info?.cursor || undefined;
  } while (cursor);

  return keys;
}
