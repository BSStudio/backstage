import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFormToken,
  loginWebsite,
  parseHtml,
  WebsiteError,
  websiteGet,
  websitePost,
} from "@/lib/website/client";

const mockFetch = vi.fn();

function html(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, ...init });
}

function redirect(location: string | null) {
  return new Response(null, {
    status: 302,
    headers: location ? { location } : {},
  });
}

async function login() {
  mockFetch.mockResolvedValueOnce(html("<html>ok</html>"));
  return loginWebsite();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WEBSITE_URL", "https://web.example.com");
  vi.stubEnv("WEBSITE_ADMIN_USERNAME", "admin");
  vi.stubEnv("WEBSITE_ADMIN_PASSWORD", "s3cret");
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ─── config ──────────────────────────────────────────────────────────────────

describe("config", () => {
  it.each([
    ["WEBSITE_URL"],
    ["WEBSITE_ADMIN_USERNAME"],
    ["WEBSITE_ADMIN_PASSWORD"],
  ])("throws when %s is missing", async (name) => {
    vi.stubEnv(name, "");
    await expect(loginWebsite()).rejects.toThrow(
      "Missing WEBSITE_URL, WEBSITE_ADMIN_USERNAME or WEBSITE_ADMIN_PASSWORD",
    );
  });

  it("strips trailing slashes from the base URL", async () => {
    vi.stubEnv("WEBSITE_URL", "https://web.example.com///");
    const session = await login();
    expect(session.baseUrl).toBe("https://web.example.com");
    expect(mockFetch.mock.calls[0][0]).toBe("https://web.example.com/user");
  });
});

// ─── loginWebsite ────────────────────────────────────────────────────────────

describe("loginWebsite", () => {
  it("posts the Drupal login form", async () => {
    await login();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://web.example.com/user");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect((init.body as URLSearchParams).toString()).toBe(
      "form_id=user_login&name=admin&pass=s3cret",
    );
  });

  it("throws on a non-ok login response", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(loginWebsite()).rejects.toThrow("Login HTTP 500");
  });

  it("throws on the Hungarian bad-credentials phrase", async () => {
    mockFetch.mockResolvedValueOnce(
      html("<p>Nem megfelelő felhasználói név vagy jelszó.</p>"),
    );

    const error = await loginWebsite().catch((e) => e);
    expect(error).toBeInstanceOf(WebsiteError);
    expect(error.status).toBe(401);
    expect(error.message).toContain("Invalid website admin credentials");
  });
});

// ─── cookie jar ──────────────────────────────────────────────────────────────

describe("cookie jar", () => {
  it("stores Set-Cookie values and replays them on later requests", async () => {
    mockFetch.mockResolvedValueOnce(
      html("ok", {
        headers: new Headers([
          ["set-cookie", "SESSabc=xyz; path=/; HttpOnly"],
          ["set-cookie", "extra=1; path=/"],
        ]),
      }),
    );
    const session = await loginWebsite();

    mockFetch.mockResolvedValueOnce(html("page"));
    await websiteGet(session, "/user/42/edit");

    expect(mockFetch.mock.calls[1][1].headers.Cookie).toBe(
      "SESSabc=xyz; extra=1",
    );
  });

  it("sends no Cookie header before any cookie is set", async () => {
    const session = await login();
    mockFetch.mockResolvedValueOnce(html("page"));
    await websiteGet(session, "/x");

    expect(mockFetch.mock.calls[1][1].headers.Cookie).toBeUndefined();
  });

  it("skips malformed Set-Cookie entries without an '='", async () => {
    mockFetch.mockResolvedValueOnce(
      html("ok", {
        headers: new Headers([
          ["set-cookie", "garbage"],
          ["set-cookie", "good=1"],
        ]),
      }),
    );
    const session = await loginWebsite();

    mockFetch.mockResolvedValueOnce(html("page"));
    await websiteGet(session, "/x");

    expect(mockFetch.mock.calls[1][1].headers.Cookie).toBe("good=1");
  });

  it("overwrites a cookie when the server re-issues it", async () => {
    mockFetch.mockResolvedValueOnce(
      html("ok", { headers: { "set-cookie": "SESS=first" } }),
    );
    const session = await loginWebsite();

    mockFetch.mockResolvedValueOnce(
      html("page", { headers: { "set-cookie": "SESS=second" } }),
    );
    await websiteGet(session, "/x");

    mockFetch.mockResolvedValueOnce(html("page"));
    await websiteGet(session, "/y");

    expect(mockFetch.mock.calls[2][1].headers.Cookie).toBe("SESS=second");
  });
});

// ─── redirect handling ───────────────────────────────────────────────────────

describe("redirect handling", () => {
  it("follows a redirect and downgrades the follow-up to GET", async () => {
    mockFetch
      .mockResolvedValueOnce(redirect("/user/42"))
      .mockResolvedValueOnce(html("landed"));

    await loginWebsite();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe("https://web.example.com/user/42");
    expect(mockFetch.mock.calls[1][1].method).toBe("GET");
    expect(mockFetch.mock.calls[1][1].body).toBeUndefined();
  });

  it("resolves an absolute Location as-is", async () => {
    mockFetch
      .mockResolvedValueOnce(redirect("https://other.example.com/landing"))
      .mockResolvedValueOnce(html("landed"));

    await loginWebsite();

    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://other.example.com/landing",
    );
  });

  it("carries cookies across a redirect hop", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: new Headers([
            ["location", "/user/42"],
            ["set-cookie", "SESS=hop"],
          ]),
        }),
      )
      .mockResolvedValueOnce(html("landed"));

    await loginWebsite();

    expect(mockFetch.mock.calls[1][1].headers.Cookie).toBe("SESS=hop");
  });

  it("returns the 3xx response when Location is absent", async () => {
    mockFetch.mockResolvedValueOnce(redirect(null));

    // 302 is not ok, so loginWebsite surfaces it rather than looping.
    await expect(loginWebsite()).rejects.toThrow("Login HTTP 302");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after MAX_REDIRECTS hops", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(redirect("/loop")));

    await expect(loginWebsite()).rejects.toThrow("Too many redirects");
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});

// ─── websiteGet / websitePost ────────────────────────────────────────────────

describe("websiteGet", () => {
  it("returns the response body", async () => {
    const session = await login();
    mockFetch.mockResolvedValueOnce(html("<p>hello</p>"));

    await expect(websiteGet(session, "/user/42/edit")).resolves.toBe(
      "<p>hello</p>",
    );
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://web.example.com/user/42/edit",
    );
  });

  it("throws on a non-ok response", async () => {
    const session = await login();
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 404 }));

    await expect(websiteGet(session, "/missing")).rejects.toThrow(
      "GET /missing HTTP 404",
    );
  });
});

describe("websitePost", () => {
  it("form-encodes the payload and stringifies numbers", async () => {
    const session = await login();
    mockFetch.mockResolvedValueOnce(html("saved"));

    await websitePost(session, "/user/42/edit", {
      name: "jkovacs",
      profile_passive: 1,
    });

    const init = mockFetch.mock.calls[1][1];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect((init.body as URLSearchParams).toString()).toBe(
      "name=jkovacs&profile_passive=1",
    );
  });

  it("throws on a non-ok response", async () => {
    const session = await login();
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 403 }));

    await expect(websitePost(session, "/user/42/edit", {})).rejects.toThrow(
      "POST /user/42/edit HTTP 403",
    );
  });
});

// ─── HTML helpers ────────────────────────────────────────────────────────────

describe("getFormToken", () => {
  it("extracts the token value by input id", () => {
    const token = getFormToken(
      '<form><input id="edit-user-register-form-token" value="tok-123"></form>',
      "edit-user-register-form-token",
    );
    expect(token).toBe("tok-123");
  });

  it("throws when the input is missing", () => {
    expect(() => getFormToken("<form></form>", "edit-missing")).toThrow(
      "Form token not found: edit-missing",
    );
  });

  it("throws when the input has no value attribute", () => {
    expect(() => getFormToken('<input id="edit-tok">', "edit-tok")).toThrow(
      "Form token not found: edit-tok",
    );
  });
});

describe("parseHtml", () => {
  it("returns a queryable cheerio root", () => {
    const $ = parseHtml('<a href="/user/42/edit">Szerkesztés</a>');
    expect($('a:contains("Szerkesztés")').attr("href")).toBe("/user/42/edit");
  });
});

describe("WebsiteError", () => {
  it("prefixes the message and keeps the status", () => {
    const error = new WebsiteError(404, "not found");
    expect(error.name).toBe("WebsiteError");
    expect(error.status).toBe(404);
    expect(error.message).toBe("Website API error: not found");
  });
});
