import {
  AlreadyExistsError,
  Attribute,
  Change,
  Client,
  NoSuchObjectError,
  ResultCodeError,
} from "ldapts";
import { activeDirectoryConfig } from "@/lib/active-directory/config";
import { EXTERNAL_REQUEST_TIMEOUT_MS } from "@/lib/http";

export class ActiveDirectoryError extends Error {
  code?: number;

  constructor(cause: unknown) {
    super(
      `Active Directory error: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ActiveDirectoryError";
    if (cause instanceof ResultCodeError) this.code = cause.code;
  }
}

export async function withDirectory<T>(
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const { url, bindDn, bindPassword, tlsOptions } = activeDirectoryConfig();
  const client = new Client({
    url,
    timeout: EXTERNAL_REQUEST_TIMEOUT_MS,
    connectTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
    tlsOptions,
  });
  try {
    await client.bind(bindDn, bindPassword);
    return await run(client);
  } catch (error) {
    throw new ActiveDirectoryError(error);
  } finally {
    // The change has landed or failed by now; a dropped socket on the way out changes neither.
    await client.unbind().catch(() => {});
  }
}

export function createDirectoryUser(
  dn: string,
  attributes: Attribute[],
): Promise<{ created: boolean }> {
  return withDirectory(async (client) => {
    try {
      await client.add(dn, attributes);
      return { created: true };
    } catch (error) {
      if (!(error instanceof AlreadyExistsError)) throw error;
    }

    // AD answers 68 for a taken sAMAccountName or userPrincipalName as well as a taken DN.
    const exists = await client
      .search(dn, { scope: "base", attributes: ["dn"] })
      .then(
        ({ searchEntries }) => searchEntries.length > 0,
        (error) => {
          if (error instanceof NoSuchObjectError) return false;
          throw error;
        },
      );
    if (!exists) {
      throw new Error(
        `No entry at ${dn}, so another account holds its sAMAccountName or userPrincipalName`,
      );
    }
    return { created: false };
  });
}

export function replaceDirectoryAttributes(
  dn: string,
  values: Record<string, string>,
): Promise<void> {
  return withDirectory((client) =>
    client.modify(
      dn,
      Object.entries(values).map(
        ([type, value]) =>
          new Change({
            operation: "replace",
            modification: new Attribute({ type, values: [value] }),
          }),
      ),
    ),
  );
}
