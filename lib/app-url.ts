// Avatar URLs are stored as paths, and both Authentik and the website render them verbatim
// against their own origin, so what they are sent has to be absolute.
export function absoluteAppUrl(path: string): string {
  const origin = process.env.APP_URL;
  if (!origin) {
    throw new Error("Missing APP_URL, needed to build an absolute URL");
  }
  return new URL(path, origin).toString();
}
