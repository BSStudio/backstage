import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNoSession, mockSession } from "../../../../helpers";
import { getTestPrisma, mockPrisma } from "../../../../setup";

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockPrisma();

  vi.stubEnv("COMPUTER_RDP_HOST_SUFFIX", "example.hu");
  vi.stubEnv("COMPUTER_RDP_PORT", "13389");
  vi.stubEnv("COMPUTER_RDP_AD_DOMAIN", "BSS");

  await getTestPrisma().computer.create({
    data: {
      id: "nle4",
      agentSub: "agent-nle4-sub",
      lastSeenAt: new Date(),
      metadata: {},
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(id = "nle4") {
  return new NextRequest(
    new URL(`/api/computers/${id}/rdp`, "http://localhost"),
  );
}

const params = (id = "nle4") => ({ params: Promise.resolve({ id }) });

async function importRoute() {
  return import("@/app/api/computers/[id]/rdp/route");
}

describe("GET /api/computers/[id]/rdp", () => {
  it("returns 401 without a session", async () => {
    mockNoSession();

    const { GET } = await importRoute();

    expect((await GET(req(), params())).status).toBe(401);
  });

  it("serves the file as an attachment named after the machine", async () => {
    mockSession({ authentikUsername: "jkovacs" });

    const { GET } = await importRoute();
    const response = await GET(req(), params());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="NLE4.rdp"',
    );
    expect(await response.text()).toContain(
      "full address:s:nle4.example.hu:13389",
    );
  });

  it("prefills the signed-in member's own domain account", async () => {
    mockSession({ authentikUsername: "jkovacs" });

    const { GET } = await importRoute();

    expect(await (await GET(req(), params())).text()).toContain(
      "username:s:BSS\\jkovacs",
    );
  });

  it("keeps the file out of any shared cache, since it names its caller", async () => {
    mockSession({ authentikUsername: "jkovacs" });

    const { GET } = await importRoute();
    const response = await GET(req(), params());

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("omits the username when the session carries no Authentik claim", async () => {
    mockSession();

    const { GET } = await importRoute();

    expect(await (await GET(req(), params())).text()).not.toContain(
      "username:s:",
    );
  });

  it("returns 404 for a machine that has never pinged", async () => {
    mockSession({ authentikUsername: "jkovacs" });

    const { GET } = await importRoute();

    expect((await GET(req("nle9"), params("nle9"))).status).toBe(404);
  });
});
