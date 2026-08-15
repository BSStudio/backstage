import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindAvailableUsername } = vi.hoisted(() => ({
  mockFindAvailableUsername: vi.fn(),
}));

vi.mock("@/lib/authentik/users", () => ({
  findAvailableUsername: mockFindAvailableUsername,
}));

async function importService() {
  vi.resetModules();
  return import("@/lib/services/usernames");
}

beforeEach(() => {
  mockFindAvailableUsername.mockReset();
  mockFindAvailableUsername.mockImplementation((base: string) =>
    Promise.resolve(base),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── resolveAvailableUsername ────────────────────────────────────────────────

describe("resolveAvailableUsername", () => {
  it("derives the base username and resolves collisions against Authentik", async () => {
    const { resolveAvailableUsername } = await importService();
    mockFindAvailableUsername.mockResolvedValue("jkovacs2");

    const username = await resolveAvailableUsername("János", "Kovács");

    expect(mockFindAvailableUsername).toHaveBeenCalledWith("jkovacs");
    expect(username).toBe("jkovacs2");
  });

  it("is uncached — repeated calls always ask Authentik", async () => {
    const { resolveAvailableUsername } = await importService();

    await resolveAvailableUsername("János", "Kovács");
    await resolveAvailableUsername("János", "Kovács");

    expect(mockFindAvailableUsername).toHaveBeenCalledTimes(2);
  });
});

// ─── suggestUsername ─────────────────────────────────────────────────────────

describe("suggestUsername", () => {
  it("returns the collision-resolved username", async () => {
    const { suggestUsername } = await importService();
    mockFindAvailableUsername.mockResolvedValue("csnagy3");

    expect(await suggestUsername("Csaba", "Nagy")).toBe("csnagy3");
  });

  it("serves repeated lookups from cache", async () => {
    const { suggestUsername } = await importService();

    await suggestUsername("János", "Kovács");
    await suggestUsername("János", "Kovács");

    expect(mockFindAvailableUsername).toHaveBeenCalledTimes(1);
  });

  it("normalizes case, whitespace and diacritics in the cache key", async () => {
    const { suggestUsername } = await importService();

    await suggestUsername("  János ", "Kovács");
    await suggestUsername("jános", "kovács");
    await suggestUsername("Janos", "Kovacs");

    expect(mockFindAvailableUsername).toHaveBeenCalledTimes(1);
  });

  it("asks Authentik again once the entry expires", async () => {
    vi.useFakeTimers();
    const { suggestUsername } = await importService();

    await suggestUsername("János", "Kovács");
    vi.advanceTimersByTime(60_001);
    await suggestUsername("János", "Kovács");

    expect(mockFindAvailableUsername).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry once the cache is full", async () => {
    const { suggestUsername } = await importService();

    // Vary the last name — the derived key only keeps the first letter of the
    // first name, so varying that would collide on a single cache entry.
    for (let i = 0; i < 500; i++) {
      await suggestUsername("Test", `Name${i}`);
    }
    // Still cached at capacity
    await suggestUsername("Test", "Name0");
    expect(mockFindAvailableUsername).toHaveBeenCalledTimes(500);

    // The 501st entry drops the oldest one
    await suggestUsername("Test", "Overflow");
    await suggestUsername("Test", "Name0");
    expect(mockFindAvailableUsername).toHaveBeenCalledTimes(502);
  });
});
