import "dotenv/config";
import { writeFileSync } from "node:fs";
import { isEmailConfigured, sendEmail } from "../lib/email/smtp";
import { renderWelcomeEmail } from "../lib/email/welcome";
import { done, fail, info, step } from "./utils";

const HTML_FILE = ".email-preview.html";
const TEXT_FILE = ".email-preview.txt";

const SAMPLE = {
  firstName: "János",
  username: "jkovacs",
};

function flagValue(flag: string): string | null {
  const args = process.argv.slice(2);
  const at = args.indexOf(flag);
  return at === -1 ? null : (args[at + 1] ?? null);
}

async function main() {
  const portalUrl = process.env.APP_URL || "http://localhost:3000";
  const loginUrl = process.env.AUTHENTIK_URL || "https://login.bsstudio.hu";

  const { subject, html, text } = renderWelcomeEmail({
    ...SAMPLE,
    portalUrl,
    loginUrl,
    mailingListAddress: process.env.GOOGLE_GROUP_EMAIL || null,
  });

  step(`Rendering: ${subject}`);
  writeFileSync(HTML_FILE, html, "utf8");
  writeFileSync(TEXT_FILE, `Subject: ${subject}\n\n${text}`, "utf8");
  info(`${HTML_FILE} — open it in a browser`);
  info(`${TEXT_FILE} — the plain-text alternative`);

  const recipient = flagValue("--send");
  if (!recipient) {
    return done(
      "Rendered. Pass --send <address> to put it through the real relay.",
    );
  }

  if (!isEmailConfigured()) {
    fail("SMTP_HOST or SMTP_FROM is not set — see .env.example.");
  }

  // A browser renders what we generated; only a real client shows what the relay, the
  // spam filters and the mail app between them make of it.
  step(`Sending to ${recipient}`);
  try {
    const result = await sendEmail({ to: recipient, subject, html, text });
    done(`${result.response ?? "sent"} (${result.messageId})`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
