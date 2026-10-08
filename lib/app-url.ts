// Avatar URLs are stored as paths, and both Authentik and the website render them verbatim
// against their own origin, so what they are sent has to be absolute.
export function absoluteAppUrl(path: string): string {
  const origin = process.env.APP_URL;
  if (!origin) {
    throw new Error("Missing APP_URL, needed to build an absolute URL");
  }
  return new URL(path, origin).toString();
}

// The origin on its own, for a link a reader clicks rather than an attribute another system
// renders — a path would leave `https://backstage.example.hu/` inside a sentence.
export function appOrigin(): string {
  return new URL(absoluteAppUrl("/")).origin;
}
