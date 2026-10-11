import { describe, expect, it } from "vitest";
import {
  createShortLinkSchema,
  editShortLinkFormSchema,
  shortLinkFormSchema,
  updateShortLinkSchema,
} from "@/lib/services/short-link-schemas";

const HOST = "l.example.hu";

describe("createShortLinkSchema", () => {
  it("trims and lowercases the slug", () => {
    const parsed = createShortLinkSchema(HOST).parse({
      slug: "  PROMO  ",
      url: "https://bsstudio.hu/a",
    });

    expect(parsed.slug).toBe("promo");
  });

  it("names the field when the slug is missing entirely", () => {
    const result = createShortLinkSchema(HOST).safeParse({
      url: "https://bsstudio.hu/a",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(
      "A rövidítés megadása kötelező",
    );
  });

  it("refuses a target on the short host", () => {
    const result = createShortLinkSchema(HOST).safeParse({
      slug: "promo",
      url: "https://L.EXAMPLE.HU/gala",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(
      "A cél nem lehet egy másik rövid link",
    );
  });

  it("allows any host when none is configured", () => {
    const parsed = createShortLinkSchema(null).parse({
      slug: "promo",
      url: "https://l.example.hu/gala",
    });

    expect(parsed.url).toBe("https://l.example.hu/gala");
  });

  it("caps the note", () => {
    const result = createShortLinkSchema(HOST).safeParse({
      slug: "promo",
      url: "https://bsstudio.hu/a",
      note: "x".repeat(121),
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("Legfeljebb 120 karakter");
  });

  it("caps the slug", () => {
    const result = createShortLinkSchema(HOST).safeParse({
      slug: "a".repeat(65),
      url: "https://bsstudio.hu/a",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("Legfeljebb 64 karakter");
  });
});

describe("updateShortLinkSchema", () => {
  it("accepts a payload carrying neither field", () => {
    expect(updateShortLinkSchema(HOST).parse({})).toEqual({});
  });

  it("still refuses a target on the short host", () => {
    const result = updateShortLinkSchema(HOST).safeParse({
      url: "https://l.example.hu/gala",
    });

    expect(result.success).toBe(false);
  });
});

describe("shortLinkFormSchema", () => {
  it("requires every field, because a form always submits all of them", () => {
    const schema = shortLinkFormSchema(HOST);

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

describe("editShortLinkFormSchema", () => {
  it("requires the target and the note, and carries no slug", () => {
    const schema = editShortLinkFormSchema(HOST);

    expect(schema.safeParse({ url: "https://bsstudio.hu/a" }).success).toBe(
      false,
    );

    const parsed = schema.parse({
      url: "https://bsstudio.hu/a",
      note: "Plakát",
    });
    expect(parsed).toEqual({ url: "https://bsstudio.hu/a", note: "Plakát" });
    expect("slug" in parsed).toBe(false);
  });
});
