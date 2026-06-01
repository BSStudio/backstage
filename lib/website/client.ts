import * as cheerio from "cheerio";

export class WebsiteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`Website API error: ${message}`);
    this.name = "WebsiteError";
  }
}

function getConfig() {
  const baseUrl = process.env.WEBSITE_URL;
  const username = process.env.WEBSITE_ADMIN_USERNAME;
  const password = process.env.WEBSITE_ADMIN_PASSWORD;
  if (!baseUrl || !username || !password) {
    throw new Error(
      "Missing WEBSITE_URL, WEBSITE_ADMIN_USERNAME or WEBSITE_ADMIN_PASSWORD environment variables",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), username, password };
}

class CookieJar {
  private cookies = new Map<string, string>();

  update(setCookieHeaders: string[]) {
    for (const sc of setCookieHeaders) {
      const [keyval] = sc.split(";");
      const eq = keyval.indexOf("=");
      if (eq < 0) continue;
      const name = keyval.slice(0, eq).trim();
      const value = keyval.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

const MAX_REDIRECTS = 5;

async function fetchWithCookies(
  jar: CookieJar,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let currentUrl = url;
  let currentInit: RequestInit = init;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const cookieHeader = jar.header();
    const res = await fetch(currentUrl, {
      ...currentInit,
      redirect: "manual",
      headers: {
        ...currentInit.headers,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
    jar.update(res.headers.getSetCookie());

    if (res.status < 300 || res.status >= 400) return res;

    const location = res.headers.get("location");
    if (!location) return res;

    currentUrl = new URL(location, currentUrl).toString();
    currentInit = { method: "GET" };
  }

  throw new WebsiteError(0, `Too many redirects following ${url}`);
}

export interface WebsiteSession {
  baseUrl: string;
  jar: CookieJar;
}

export async function loginWebsite(): Promise<WebsiteSession> {
  const { baseUrl, username, password } = getConfig();
  const jar = new CookieJar();

  const body = new URLSearchParams({
    form_id: "user_login",
    name: username,
    pass: password,
  });

  const res = await fetchWithCookies(jar, `${baseUrl}/user`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!res.ok) throw new WebsiteError(res.status, `Login HTTP ${res.status}`);

  const text = await res.text();
  if (text.includes("Nem megfelelő felhasználói név vagy jelszó.")) {
    throw new WebsiteError(401, "Invalid website admin credentials");
  }

  return { baseUrl, jar };
}

export async function websiteGet(
  session: WebsiteSession,
  path: string,
): Promise<string> {
  const res = await fetchWithCookies(session.jar, `${session.baseUrl}${path}`);
  if (!res.ok)
    throw new WebsiteError(res.status, `GET ${path} HTTP ${res.status}`);
  return res.text();
}

export async function websitePost(
  session: WebsiteSession,
  path: string,
  data: Record<string, string | number>,
): Promise<string> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) body.append(k, String(v));

  const res = await fetchWithCookies(session.jar, `${session.baseUrl}${path}`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!res.ok)
    throw new WebsiteError(res.status, `POST ${path} HTTP ${res.status}`);
  return res.text();
}

export function getFormToken(html: string, tokenId: string): string {
  const $ = cheerio.load(html);
  const token = $(`input#${tokenId}`).attr("value");
  if (!token) {
    throw new WebsiteError(0, `Form token not found: ${tokenId}`);
  }
  return token;
}

export function parseHtml(html: string) {
  return cheerio.load(html);
}
