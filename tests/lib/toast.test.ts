import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSuccess = vi.fn();
const mockWarning = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockSuccess.mockReset();
  mockWarning.mockReset();
  vi.doMock("sonner", () => ({
    toast: { success: mockSuccess, warning: mockWarning },
  }));
});

describe("toastSync", () => {
  it("reports a clean write as a success", async () => {
    const { toastSync } = await import("@/lib/toast");

    toastSync("Adatok mentve");

    expect(mockSuccess).toHaveBeenCalledWith("Adatok mentve");
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it("treats an empty error list as a clean write", async () => {
    const { toastSync } = await import("@/lib/toast");

    toastSync("Adatok mentve", []);

    expect(mockSuccess).toHaveBeenCalledWith("Adatok mentve");
  });

  it("warns with the failures when a sync step failed", async () => {
    const { toastSync } = await import("@/lib/toast");

    toastSync("Adatok mentve", ["Authentik unreachable", "Website HTTP 500"]);

    expect(mockWarning).toHaveBeenCalledWith(
      "Adatok mentve, de a szinkronizálás során hiba történt: Authentik unreachable, Website HTTP 500",
    );
    expect(mockSuccess).not.toHaveBeenCalled();
  });
});
