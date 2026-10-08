// Avatar URLs are stored as paths, and both Authentik and the website render them verbatim
// against their own origin, so what they are sent has to be absolute.
export function absoluteAppUrl(path: string): string {
  const origin = process.env.APP_URL;
  if (!origin) {
    throw new Error("Missing APP_URL, needed to build an absolute URL");
  }
  return new URL(path, origin).toString();
}

// The bare origin: a letter puts this in a sentence, where a trailing slash reads as a typo.
export function appOrigin(): string {
  return new URL(absoluteAppUrl("/")).origin;
}
