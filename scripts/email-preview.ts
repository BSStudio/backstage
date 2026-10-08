import "dotenv/config";
import { writeFileSync } from "node:fs";
import type { RenderedEmail } from "../lib/email/components";
import { isEmailConfigured, sendEmail } from "../lib/email/smtp";
import { renderWelcomeEmail } from "../lib/email/welcome";
import { done, fail, info, step } from "./utils";

const HTML_FILE = ".email-preview.html";
const TEXT_FILE = ".email-preview.txt";

// Invented, like the seed roster: a preview is looked at, so it needs a name and a
// username rather than placeholders. One entry per letter the app can send.
const TEMPLATES: Record<string, () => RenderedEmail> = {
  welcome: () =>
    renderWelcomeEmail({
      firstName: "János",
      username: "jkovacs",
      portalUrl: process.env.APP_URL || "http://localhost:3000",
      loginUrl: process.env.AUTHENTIK_URL || "https://login.bsstudio.hu",
      mailingListAddress: process.env.GOOGLE_GROUP_EMAIL || null,
    }),
};

function flagValue(flag: string): string | null {
  const args = process.argv.slice(2);
  const at = args.indexOf(flag);
  return at === -1 ? null : (args[at + 1] ?? null);
}

function pickTemplate(): () => RenderedEmail {
  const names = Object.keys(TEMPLATES);
  const requested = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const name = requested ?? names[0];
  const template = name ? TEMPLATES[name] : undefined;
  if (!template)
    fail(`Unknown template "${name}" — try one of: ${names.join(", ")}`);
  step(`Rendering the ${name} letter`);
  return template;
}

async function main() {
  const { subject, html, text } = pickTemplate()();

  writeFileSync(HTML_FILE, html, "utf8");
  writeFileSync(TEXT_FILE, `Subject: ${subject}\n\n${text}`, "utf8");
  info(subject);
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
