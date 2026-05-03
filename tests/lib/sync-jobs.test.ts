import { describe, expect, it } from "vitest";
import {
  SYNC_OPERATION_LABELS,
  SYNC_STATUS_LABELS,
  SYNC_STATUS_VARIANT,
  SYNC_TARGET_LABELS,
} from "@/lib/sync-jobs";

describe("sync-jobs labels", () => {
  it("has a non-empty Hungarian label for every status", () => {
    for (const [key, value] of Object.entries(SYNC_STATUS_LABELS)) {
      expect(
        value,
        `status "${key}" should have a non-empty label`,
      ).toBeTruthy();
      expect(value.trim()).toBe(value);
    }
  });

  it("has a Tailwind variant class for every status", () => {
    for (const [key, value] of Object.entries(SYNC_STATUS_VARIANT)) {
      expect(value, `status "${key}" should have a variant class`).toBeTruthy();
    }
  });

  it("has a non-empty label for every target", () => {
    for (const [key, value] of Object.entries(SYNC_TARGET_LABELS)) {
      expect(
        value,
        `target "${key}" should have a non-empty label`,
      ).toBeTruthy();
      expect(value.trim()).toBe(value);
    }
  });

  it("has a non-empty Hungarian label for every operation", () => {
    for (const [key, value] of Object.entries(SYNC_OPERATION_LABELS)) {
      expect(
        value,
        `operation "${key}" should have a non-empty label`,
      ).toBeTruthy();
      expect(value.trim()).toBe(value);
    }
  });
});
