import "dotenv/config";
import { getGroupEmail, isGoogleGroupConfigured } from "../lib/google/client";
import { listGroupMembers } from "../lib/google/groups";
import { done, fail, info, step } from "./utils";

async function main() {
  if (!isGoogleGroupConfigured()) {
    fail(
      "GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_GROUP_EMAIL is not set — see .env.example.",
    );
  }

  step(`Listing members of ${getGroupEmail()}`);
  try {
    const members = await listGroupMembers();
    for (const member of members) {
      info(`${member.email}  ${member.roles.join(", ") || "-"}`);
    }
    done(`${members.length} member(s)`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
