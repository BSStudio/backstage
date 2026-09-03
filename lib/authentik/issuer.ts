// Authentik's issuer identifier ends in a slash — `https://…/application/o/backstage/` is what
// its own discovery document reports — so joining a path onto it verbatim yields `//…`, which
// Authentik answers 404 to. The canonical spelling here drops the slash so a path can be
// appended; the slash-terminated form is still what arrives in an `iss` claim, so a verifier
// has to accept both.
export function authentikIssuer(): string {
  return (process.env.AUTHENTIK_ISSUER ?? "").replace(/\/+$/, "");
}
