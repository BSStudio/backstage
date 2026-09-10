import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWebsiteWebhookConfigured,
  pushMembers,
  type WebsiteMember,
  WebsiteWebhookError,
} from "@/lib/website/webhook";

const URL = "https://example.hu/api/webhooks/members";
const TOKEN = "11111111-2222-3333-4444-555555555555.s3cret";

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const MEMBER: WebsiteMember = {
  sub: "uuid-member-1",
  fullName: "Kovács János",
  nickname: "Jani",
  avatarUrl: null,
  membershipStatus: "MEMBER",
  isLeadership: false,
  joinedSemester: "2025/2026/1",
};

const OK_RESULT = {
  mode: "operations",
  operationCount: 1,
  created: 1,
  updated: 0,
  archived: 0,
  restored: 0,
  unchanged: 0,
  ignored: 0,
};

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv("WEBSITE_WEBHOOK_URL", URL);
  vi.stubEnv("WEBSITE_WEBHOOK_TOKEN", TOKEN);
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isWebsiteWebhookConfigured", () => {
  it("is true when both variables are set", () => {
    expect(isWebsiteWebhookConfigured()).toBe(true);
  });

  it.each([["WEBSITE_WEBHOOK_URL"], ["WEBSITE_WEBHOOK_TOKEN"]])(
    "is false when %s is missing",
    (name) => {
      vi.stubEnv(name, "");
      expect(isWebsiteWebhookConfigured()).toBe(false);
    },
  );
});

describe("pushMembers", () => {
  it("posts the payload as bearer-authenticated JSON with the delivery id", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ ok: true, duplicate: false, result: OK_RESULT }),
    );

    const response = await pushMembers(
      { operations: [{ op: "upsert", member: MEMBER }] },
      "job-abc",
    );

    expect(response).toEqual({
      ok: true,
      duplicate: false,
      result: OK_RESULT,
    });
    expect(mockFetch).toHaveBeenCalledWith(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "x-bss-delivery-id": "job-abc",
      },
      body: JSON.stringify({ operations: [{ op: "upsert", member: MEMBER }] }),
    });
  });

  it("sends a replace payload unchanged", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true, duplicate: false }));

    await pushMembers({ mode: "replace", members: [MEMBER] }, "job-abc");

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      mode: "replace",
      members: [MEMBER],
    });
  });

  it("returns the duplicate marker rather than treating a repeat as a failure", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ ok: true, duplicate: true, deliveryId: "job-abc" }),
    );

    const response = await pushMembers({ operations: [] }, "job-abc");

    expect(response).toEqual({
      ok: true,
      duplicate: true,
      deliveryId: "job-abc",
    });
  });

  it.each([["WEBSITE_WEBHOOK_URL"], ["WEBSITE_WEBHOOK_TOKEN"]])(
    "throws when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");

      await expect(pushMembers({ operations: [] }, "job-abc")).rejects.toThrow(
        "Missing WEBSITE_WEBHOOK_URL or WEBSITE_WEBHOOK_TOKEN",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it("names every validation problem, not just the status", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          error: "validation",
          message: "Érvénytelen kérés.",
          problems: ["sub: kötelező mező.", "fullName: kötelező mező."],
        },
        400,
      ),
    );

    const error = await pushMembers({ operations: [] }, "job-abc").catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(WebsiteWebhookError);
    expect(error.status).toBe(400);
    expect(error.message).toBe(
      "Website webhook error: sub: kötelező mező.; fullName: kötelező mező.",
    );
  });

  it("falls back to the message when there are no problems listed", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        { error: "internal", message: "A tagfrissítés mentése nem sikerült." },
        500,
      ),
    );

    const error = await pushMembers({ operations: [] }, "job-abc").catch(
      (e) => e,
    );

    expect(error.message).toBe(
      "Website webhook error: A tagfrissítés mentése nem sikerült.",
    );
  });

  it.each([
    [{ error: "internal" }],
    [{ message: "" }],
    [{ problems: [] }],
    [null],
    ["not an object"],
  ])("falls back to the status line for %j", async (body) => {
    mockFetch.mockResolvedValue(jsonResponse(body, 500));

    const error = await pushMembers({ operations: [] }, "job-abc").catch(
      (e) => e,
    );

    expect(error.message).toBe("Website webhook error: HTTP 500");
  });

  it("treats a body that is not JSON as a failure even on a 200", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error("Unexpected token <")),
    });

    const error = await pushMembers({ operations: [] }, "job-abc").catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(WebsiteWebhookError);
    expect(error.message).toBe("Website webhook error: Response was not JSON");
  });
});
