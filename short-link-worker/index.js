const HOME = "https://bsstudio.hu";

// Hungarian needs the charset stated, or the browser guesses and mangles it.
const TEXT = { "content-type": "text/plain; charset=utf-8" };

export default {
  async fetch(request, env) {
    const slug = new URL(request.url).pathname
      .slice(1)
      .replace(/\/+$/, "")
      .toLowerCase();

    if (!slug) return Response.redirect(HOME, 302);

    const url = await env.LINKS.get(slug);
    if (!url) {
      return new Response("Nincs ilyen rövidítés.", {
        status: 404,
        headers: TEXT,
      });
    }

    // Returns immediately; the runtime writes the point in the background.
    env.CLICKS.writeDataPoint({ blobs: [slug], indexes: [slug] });

    // 302, never 301: a browser caches a 301 indefinitely, so a retargeted slug would keep
    // sending that visitor to the old URL forever.
    return Response.redirect(url, 302);
  },
};
