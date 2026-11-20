import { describe, expect, it } from "vitest";
import {
  createShortLinkSchema,
  shortLinkFormSchema,
  updateShortLinkSchema,
} from "@/lib/services/short-link-schemas";

const BASE = "https://bsstudio.hu/s";

describe("createShortLinkSchema", () => {
  it("trims and lowercases the slug", () => {
    const parsed = createShortLinkSchema(BASE).parse({
      slug: "  PROMO  ",
      url: "https://bsstudio.hu/a",
    });

    expect(parsed.slug).toBe("promo");
  });

  it("names the field when the slug is missing entirely", () => {
    const result = createShortLinkSchema(BASE).safeParse({
      url: "https://bsstudio.hu/a",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(
      "A végződés megadása kötelező",
    );
  });

  it("refuses a target under the short-link base", () => {
    const result = createShortLinkSchema(BASE).safeParse({
      slug: "promo",
      url: "https://BSSTUDIO.HU/s/gala",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(
      "A cél nem lehet egy másik rövid link",
    );
  });

  it.each([
    "https://www.bsstudio.hu/s/gala",
    "https://bsstudio.hu/%73/gala",
    "https://bsstudio.hu//s/gala",
    "https://bsstudio.hu/S/gala",
  ])("refuses %s, which still reaches the Worker", (url) => {
    expect(
      createShortLinkSchema(BASE).safeParse({ slug: "promo", url }).success,
    ).toBe(false);
  });

  it("allows a target whose path cannot be decoded", () => {
    expect(
      createShortLinkSchema(BASE).safeParse({
        slug: "promo",
        url: "https://bsstudio.hu/%E0%A4%A",
      }).success,
    ).toBe(true);
  });

  it.each([
    "https://bsstudio.hu/esemenyek",
    "https://bsstudio.hu/sajto",
    "https://bsstudio.hu/s",
  ])("allows %s, which is outside the base path", (url) => {
    expect(
      createShortLinkSchema(BASE).safeParse({ slug: "promo", url }).success,
    ).toBe(true);
  });

  it("refuses the whole host when the base has no path", () => {
    const result = createShortLinkSchema("https://l.example.hu").safeParse({
      slug: "promo",
      url: "https://l.example.hu/gala",
    });

    expect(result.success).toBe(false);
  });

  it.each([null, "not a url"])(
    "allows any target when the base is %p",
    (base) => {
      const parsed = createShortLinkSchema(base).parse({
        slug: "promo",
        url: "https://bsstudio.hu/s/gala",
      });

      expect(parsed.url).toBe("https://bsstudio.hu/s/gala");
    },
  );

  it("caps the note", () => {
    const result = createShortLinkSchema(BASE).safeParse({
      slug: "promo",
      url: "https://bsstudio.hu/a",
      note: "x".repeat(121),
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("Legfeljebb 120 karakter");
  });

  it("caps the slug", () => {
    const result = createShortLinkSchema(BASE).safeParse({
      slug: "a".repeat(65),
      url: "https://bsstudio.hu/a",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("Legfeljebb 64 karakter");
  });
});

describe("updateShortLinkSchema", () => {
  it("accepts a payload carrying neither field", () => {
    expect(updateShortLinkSchema(BASE).parse({})).toEqual({});
  });

  it("still refuses a target under the short-link base", () => {
    const result = updateShortLinkSchema(BASE).safeParse({
      url: "https://bsstudio.hu/s/gala",
    });

    expect(result.success).toBe(false);
  });
});

describe("shortLinkFormSchema", () => {
  it("requires every field, because a form always submits all of them", () => {
    const schema = shortLinkFormSchema(BASE);

    expect(
      schema.safeParse({ slug: "promo", url: "https://bsstudio.hu/a" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        slug: "promo",
        url: "https://bsstudio.hu/a",
        note: "",
      }).success,
    ).toBe(true);
  });
});
