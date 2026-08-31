import { describe, expect, it } from "vitest";
import { hashCardDavToken, mintCardDavToken } from "@/lib/carddav/tokens";

describe("mintCardDavToken", () => {
  it("returns 256 bits encoded as unpadded base64url", () => {
    const token = mintCardDavToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never repeats itself", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => mintCardDavToken()),
    );

    expect(tokens.size).toBe(50);
  });
});

describe("hashCardDavToken", () => {
  it("is the SHA-256 digest in lowercase hex", () => {
    expect(hashCardDavToken("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });

  it("is stable for one token and different for another", () => {
    const token = mintCardDavToken();

    expect(hashCardDavToken(token)).toBe(hashCardDavToken(token));
    expect(hashCardDavToken(token)).not.toBe(
      hashCardDavToken(mintCardDavToken()),
    );
  });
});
