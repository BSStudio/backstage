import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteKvKeys, listKvKeys, putKvPairs } from "@/lib/cloudflare/kv";

const mockFetch = vi.fn();

function envelope(result: unknown, cursor?: string) {
  return new Response(
    JSON.stringify({
      success: true,
      errors: [],
      result,
      ...(cursor === undefined ? {} : { result_info: { cursor } }),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const BULK_URL =
  "https://api.cloudflare.com/client/v4/accounts/acct-1/storage/kv/namespaces/ns-1/bulk";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct-1");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-1");
  vi.stubEnv("CLOUDFLARE_KV_NAMESPACE_ID", "ns-1");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("putKvPairs", () => {
  it("writes the pairs as a JSON array to the bulk endpoint", async () => {
    mockFetch.mockResolvedValue(envelope(null));

    await putKvPairs([{ key: "promo", value: "https://example.hu/a" }]);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(BULK_URL);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual([
      { key: "promo", value: "https://example.hu/a" },
    ]);
  });

  it("sends nothing for an empty list", async () => {
    await putKvPairs([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("splits past the bulk limit", async () => {
    mockFetch.mockImplementation(async () => envelope(null));
    const pairs = Array.from({ length: 10_001 }, (_, i) => ({
      key: `k${i}`,
      value: "https://example.hu",
    }));

    await putKvPairs(pairs);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toHaveLength(10_000);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toHaveLength(1);
  });
});

describe("deleteKvKeys", () => {
  it("posts a plain array of key names", async () => {
    mockFetch.mockResolvedValue(envelope(null));

    await deleteKvKeys(["promo", "gala"]);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BULK_URL}/delete`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(["promo", "gala"]);
  });

  it("sends nothing for an empty list", async () => {
    await deleteKvKeys([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("splits past the bulk limit", async () => {
    mockFetch.mockImplementation(async () => envelope(null));

    await deleteKvKeys(Array.from({ length: 10_001 }, (_, i) => `k${i}`));

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("listKvKeys", () => {
  it("returns the key names from a single page", async () => {
    mockFetch.mockResolvedValue(
      envelope([{ name: "promo" }, { name: "gala" }]),
    );

    expect(await listKvKeys()).toEqual(["promo", "gala"]);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-1/storage/kv/namespaces/ns-1/keys",
    );
  });

  it("follows the cursor until it is empty", async () => {
    mockFetch
      .mockResolvedValueOnce(envelope([{ name: "a" }], "cur sor"))
      .mockResolvedValueOnce(envelope([{ name: "b" }], ""));

    expect(await listKvKeys()).toEqual(["a", "b"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain("?cursor=cur%20sor");
  });

  it("stops when the response carries no result_info", async () => {
    mockFetch.mockResolvedValue(envelope([{ name: "a" }]));

    expect(await listKvKeys()).toEqual(["a"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
