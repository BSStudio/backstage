// Separate from `lib/computers.ts` because client components import that one, and this
// reads the environment.

const DEFAULT_PORT = 3389;

// A CRLF would inject settings lines of its own, and a derived username is none of these
// characters anyway.
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

// Everything else `Number` accepts — hex, exponents — is a typo rather than a port.
const PORT_PATTERN = /^\d+$/;

// The file is read by mstsc on Windows, not by anything here.
const LINE_ENDING = "\r\n";

export interface RdpConfig {
  hostSuffix: string;
  port: number;
  adDomain: string | null;
}

export function isRdpConfigured(): boolean {
  try {
    rdpConfig();
    return true;
  } catch {
    return false;
  }
}

export function rdpConfig(): RdpConfig {
  const hostSuffix = process.env.COMPUTER_RDP_HOST_SUFFIX?.trim();
  if (!hostSuffix) {
    throw new Error("Missing COMPUTER_RDP_HOST_SUFFIX environment variable");
  }

  const rawPort = process.env.COMPUTER_RDP_PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT;
  if ((rawPort && !PORT_PATTERN.test(rawPort)) || port < 1 || port > 65535) {
    throw new Error(`Invalid COMPUTER_RDP_PORT: ${rawPort}`);
  }

  return {
    hostSuffix,
    port,
    adDomain: process.env.COMPUTER_RDP_AD_DOMAIN?.trim() || null,
  };
}

export function buildRdpFile(
  computerId: string,
  username: string | null,
): string {
  const { hostSuffix, port, adDomain } = rdpConfig();

  const lines = [`full address:s:${computerId}.${hostSuffix}:${port}`];

  if (adDomain && username && USERNAME_PATTERN.test(username)) {
    lines.push(`username:s:${adDomain}\\${username}`);
  }

  // The file prefills a name and never a secret, so the client still has to ask.
  lines.push("prompt for credentials:i:1");

  return `${lines.join(LINE_ENDING)}${LINE_ENDING}`;
}
