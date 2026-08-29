import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  pageSlice,
  resolvePage,
  totalPages,
} from "@/lib/services/pagination";

describe("pageSlice", () => {
  it("starts the first page at the beginning", () => {
    expect(pageSlice(1)).toEqual({ skip: 0, take: PAGE_SIZE });
  });

  it("skips the pages before the requested one", () => {
    expect(pageSlice(3)).toEqual({ skip: 2 * PAGE_SIZE, take: PAGE_SIZE });
  });

  it("rounds a fractional page down to a whole skip", () => {
    expect(pageSlice(2.7)).toEqual({ skip: PAGE_SIZE, take: PAGE_SIZE });
  });

  it("falls back to the first page when the skip is not expressible", () => {
    expect(pageSlice(Number.POSITIVE_INFINITY)).toEqual({
      skip: 0,
      take: PAGE_SIZE,
    });
  });

  it("keeps the skip inside the safe integer range", () => {
    const { skip } = pageSlice(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(skip)).toBe(true);
  });
});

describe("resolvePage", () => {
  it("reads a page number out of the query string", () => {
    expect(resolvePage("3")).toBe(3);
  });

  it("starts at the first page when the parameter is missing", () => {
    expect(resolvePage(undefined)).toBe(1);
  });

  it("starts at the first page when the parameter is not a number", () => {
    expect(resolvePage("abc")).toBe(1);
  });

  it("starts at the first page below the first page", () => {
    expect(resolvePage("0")).toBe(1);
    expect(resolvePage("-4")).toBe(1);
  });

  it("truncates a fractional page so the nav marks the page it queried", () => {
    expect(resolvePage("1.1")).toBe(1);
  });

  it("caps a page whose skip would overflow", () => {
    expect(resolvePage("1e400")).toBe(1);
    expect(resolvePage("1e15")).toBe(
      Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE),
    );
  });
});

describe("totalPages", () => {
  it("reports one page when there is nothing to show", () => {
    expect(totalPages(0)).toBe(1);
  });

  it("counts a partial page as a page", () => {
    expect(totalPages(PAGE_SIZE + 1)).toBe(2);
  });

  it("does not add an empty page on an exact fit", () => {
    expect(totalPages(PAGE_SIZE * 2)).toBe(2);
  });
});
