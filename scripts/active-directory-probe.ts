import "dotenv/config";
import { withDirectory } from "../lib/active-directory/client";
import {
  activeDirectoryConfig,
  isActiveDirectoryConfigured,
} from "../lib/active-directory/config";
import { done, fail, info, step } from "./utils";

async function main() {
  if (!isActiveDirectoryConfigured()) {
    fail(
      "AD_LDAP_URL, AD_BIND_DN, AD_BIND_PASSWORD, AD_USERS_OU or AD_UPN_SUFFIX is not set — see .env.example.",
    );
  }

  try {
    const { url, bindDn, usersOu } = activeDirectoryConfig();
    step(`Binding to ${url} as ${bindDn}`);
    const entries = await withDirectory(async (client) => {
      // Computer objects carry objectClass=user too.
      const { searchEntries } = await client.search(usersOu, {
        scope: "one",
        filter: "(&(objectCategory=person)(objectClass=user))",
        attributes: ["sAMAccountName", "userAccountControl"],
      });
      return searchEntries;
    });
    for (const entry of entries) {
      info(
        `${entry.sAMAccountName}  userAccountControl=${entry.userAccountControl}  ${entry.dn}`,
      );
    }
    done(`${entries.length} account(s) in ${usersOu}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
