import { createTransport } from "nodemailer";
import { EXTERNAL_REQUEST_TIMEOUT_MS } from "@/lib/http";

// 465 wraps the session in TLS from the first byte; everything else negotiates STARTTLS.
const IMPLICIT_TLS_PORT = 465;
const DEFAULT_PORT = 587;

export class EmailError extends Error {
  constructor(message: string) {
    super(`Email error: ${message}`);
    this.name = "EmailError";
  }
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  messageId: string;
  /** The relay's own reply, e.g. `250 2.0.0 OK`. */
  response: string | null;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getConfig() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) {
    throw new Error("Missing SMTP_HOST or SMTP_FROM environment variables");
  }

  const port = Number(process.env.SMTP_PORT) || DEFAULT_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  return {
    host,
    port,
    from,
    // A relay that accepts mail from this host by address needs no credentials, and an
    // empty `auth` would make nodemailer offer AUTH with an empty username.
    auth: user && pass ? { user, pass } : undefined,
    // Leadership, not the members list: a new member answering is asking whoever added them.
    replyTo: process.env.SMTP_REPLY_TO || undefined,
  };
}

export async function sendEmail(
  email: OutgoingEmail,
): Promise<EmailSendResult> {
  const { host, port, from, auth, replyTo } = getConfig();

  // One connection per message: a pool would hold a socket open between letters, and the
  // studio sends a handful a semester.
  const transport = createTransport({
    host,
    port,
    secure: port === IMPLICIT_TLS_PORT,
    auth,
    connectionTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
    greetingTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
    socketTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
  });

  try {
    const info = await transport
      .sendMail({ from, replyTo, ...email })
      .catch((error: unknown) => {
        throw new EmailError((error as Error).message);
      });

    // A relay can accept the session and refuse the recipient; without this the job
    // records a success for a message nobody received.
    if (info.accepted.length === 0) {
      throw new EmailError("The relay accepted no recipient");
    }

    return { messageId: info.messageId, response: info.response ?? null };
  } finally {
    transport.close();
  }
}
