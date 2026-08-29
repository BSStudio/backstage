import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

// base64url rather than hex or plain base64: the token is typed or pasted into a phone's
// password field and travels in an HTTP Basic header, and neither `+`, `/` nor `=` survives
// that reliably.
export function mintCardDavToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashCardDavToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
