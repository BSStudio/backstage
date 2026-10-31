import type { ConnectionOptions } from "node:tls";

export interface ActiveDirectoryConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  usersOu: string;
  upnSuffix: string;
  tlsOptions: ConnectionOptions;
}

function requiredSettings() {
  return {
    url: process.env.AD_LDAP_URL,
    bindDn: process.env.AD_BIND_DN,
    bindPassword: process.env.AD_BIND_PASSWORD,
    usersOu: process.env.AD_USERS_OU,
    upnSuffix: process.env.AD_UPN_SUFFIX,
  };
}

export function isActiveDirectoryConfigured(): boolean {
  return Object.values(requiredSettings()).every(Boolean);
}

// `ca` replaces Node's default trust store rather than adding to it.
function tlsOptions(): ConnectionOptions {
  if (process.env.AD_LDAP_TLS_VERIFY?.trim().toLowerCase() === "false") {
    return { rejectUnauthorized: false };
  }

  const raw = process.env.AD_LDAP_CA_CERT;
  if (!raw) return {};

  const ca = Buffer.from(raw, "base64").toString("utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("AD_LDAP_CA_CERT is not a base64-encoded PEM certificate");
  }
  return { ca };
}

export function activeDirectoryConfig(): ActiveDirectoryConfig {
  const { url, bindDn, bindPassword, usersOu, upnSuffix } = requiredSettings();
  if (!url || !bindDn || !bindPassword || !usersOu || !upnSuffix) {
    throw new Error(
      "Missing AD_LDAP_URL, AD_BIND_DN, AD_BIND_PASSWORD, AD_USERS_OU or AD_UPN_SUFFIX environment variables",
    );
  }
  // AD only accepts `unicodePwd` over an encrypted connection.
  if (!url.startsWith("ldaps://")) {
    throw new Error("AD_LDAP_URL must start with ldaps://");
  }

  return {
    url,
    bindDn,
    bindPassword,
    usersOu,
    upnSuffix,
    tlsOptions: tlsOptions(),
  };
}

// Must not validate the connection settings: every Authentik attribute update calls this.
export function memberDistinguishedName(memberId: string): string {
  const { usersOu } = requiredSettings();
  if (!usersOu) throw new Error("Missing AD_USERS_OU environment variable");
  return `CN=${memberId},${usersOu}`;
}
