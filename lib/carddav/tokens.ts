import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

// base64url, not plain base64: the token is pasted into a phone's password field and sent
// in a Basic header, where `+`, `/` and `=` do not survive reliably.
export function mintCardDavToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashCardDavToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
