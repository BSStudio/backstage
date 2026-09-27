import { cloudflareRequest, kvNamespaceId } from "./client";

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

export async function putKvPairs(pairs: KvPair[]): Promise<void> {
  for (const batch of chunk(pairs, BULK_LIMIT)) {
    await cloudflareRequest<unknown>(namespacePath("/bulk"), {
      method: "PUT",
      body: JSON.stringify(batch),
    });
  }
}

export async function deleteKvKeys(keys: string[]): Promise<void> {
  for (const batch of chunk(keys, BULK_LIMIT)) {
    await cloudflareRequest<unknown>(namespacePath("/bulk/delete"), {
      method: "POST",
      body: JSON.stringify(batch),
    });
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
