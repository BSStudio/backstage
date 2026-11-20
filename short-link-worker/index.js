const HOME = "https://bsstudio.hu";

// The route in wrangler.jsonc and SHORT_LINK_BASE_URL in Backstage both end in this.
const PREFIX = "/s/";

// Link previews and crawlers fetch a URL when it is shared; none of them is a click.
const NOT_A_CLICK = /bot|crawl|spider|preview|facebookexternalhit|whatsapp/i;

// Hungarian needs the charset stated, or the browser guesses and mangles it.
const TEXT = { "content-type": "text/plain; charset=utf-8" };

function notFound() {
  return new Response("Nincs ilyen rövid link.", {
    status: 404,
    headers: TEXT,
  });
}

// The target's own parameters win over the visitor's.
function withQuery(target, search) {
  if (!search) return target;
  const url = new URL(target);
  const own = new Set(url.searchParams.keys());
  for (const [key, value] of new URLSearchParams(search)) {
    if (!own.has(key)) url.searchParams.append(key, value);
  }
  return url.href;
}

export default {
  async fetch(request, env) {
    const { pathname, search } = new URL(request.url);
    if (!pathname.startsWith(PREFIX)) return notFound();

    const slug = pathname
      .slice(PREFIX.length)
      .replace(/\/+$/, "")
      .toLowerCase();

    if (!slug) return Response.redirect(HOME, 302);

    const url = await env.LINKS.get(slug);
    if (!url) return notFound();

    const agent = request.headers.get("user-agent") ?? "";
    if (request.method === "GET" && !NOT_A_CLICK.test(agent)) {
      // Returns immediately; the runtime writes the point in the background.
      env.CLICKS.writeDataPoint({ blobs: [slug], indexes: [slug] });
    }

    // 302, never 301: a browser caches a 301 indefinitely, so a retargeted slug would keep
    // sending that visitor to the old URL forever.
    return Response.redirect(withQuery(url, search), 302);
  },
};
