import { describe, expect, it } from "vitest";
import {
  GOOGLE_GROUP_MATCH_LABELS,
  GOOGLE_GROUP_MATCH_VARIANT,
  googleGroupUrl,
} from "@/lib/google-group";

describe("google group labels", () => {
  it("has a non-empty Hungarian label for every match status", () => {
    for (const [key, value] of Object.entries(GOOGLE_GROUP_MATCH_LABELS)) {
      expect(value, `status "${key}" should have a label`).toBeTruthy();
      expect(value.trim()).toBe(value);
    }
  });

  it("has a badge class for every match status", () => {
    for (const key of Object.keys(GOOGLE_GROUP_MATCH_LABELS)) {
      expect(
        GOOGLE_GROUP_MATCH_VARIANT[
          key as keyof typeof GOOGLE_GROUP_MATCH_VARIANT
        ],
      ).toBeTruthy();
    }
  });
});

describe("googleGroupUrl", () => {
  it("builds the Workspace group URL from the address", () => {
    expect(googleGroupUrl("bss@simonyi.bme.hu")).toBe(
      "https://groups.google.com/a/simonyi.bme.hu/g/bss",
    );
  });
});
