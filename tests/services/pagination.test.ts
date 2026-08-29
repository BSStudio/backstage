import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageSlice, totalPages } from "@/lib/services/pagination";

describe("pageSlice", () => {
  it("starts the first page at the beginning", () => {
    expect(pageSlice(1)).toEqual({ skip: 0, take: PAGE_SIZE });
  });

  it("skips the pages before the requested one", () => {
    expect(pageSlice(3)).toEqual({ skip: 2 * PAGE_SIZE, take: PAGE_SIZE });
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
