import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmailError,
  isEmailConfigured,
  type OutgoingEmail,
  sendEmail,
} from "@/lib/email/smtp";
import { EXTERNAL_REQUEST_TIMEOUT_MS } from "@/lib/http";

const { mockCreateTransport } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
}));

vi.mock("nodemailer", () => ({ createTransport: mockCreateTransport }));

const EMAIL: OutgoingEmail = {
  to: "kovacs.janos@bsstudio.hu",
  subject: "Üdvözlet a stúdióban! 🎥",
  html: "<p>Szia!</p>",
  text: "Szia!",
};

const mockSendMail = vi.fn();
const mockClose = vi.fn();

function accepted() {
  return {
    accepted: [EMAIL.to],
    rejected: [],
    messageId: "<abc@bsstudio.hu>",
    response: "250 2.0.0 OK",
  };
}

function transportOptions() {
  return mockCreateTransport.mock.calls[0]?.[0];
}

beforeEach(() => {
  mockCreateTransport.mockReset();
  mockSendMail.mockReset();
  mockClose.mockReset();
  mockCreateTransport.mockReturnValue({
    sendMail: mockSendMail,
    close: mockClose,
  });
  mockSendMail.mockResolvedValue(accepted());

  vi.stubEnv("SMTP_HOST", "smtp.bsstudio.hu");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "backstage");
  vi.stubEnv("SMTP_PASSWORD", "s3cret");
  vi.stubEnv("SMTP_FROM", "BSS <noreply@bsstudio.hu>");
  vi.stubEnv("SMTP_REPLY_TO", "bss-vez@simonyi.bme.hu");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isEmailConfigured", () => {
  it("is true when the host and the sender are both set", () => {
    expect(isEmailConfigured()).toBe(true);
  });

  it.each([["SMTP_HOST"], ["SMTP_FROM"]])("is false without %s", (name) => {
    vi.stubEnv(name, "");
    expect(isEmailConfigured()).toBe(false);
  });
});

describe("sendEmail", () => {
  it("sends the message and returns what the relay answered", async () => {
    const result = await sendEmail(EMAIL);

    expect(result).toEqual({
      messageId: "<abc@bsstudio.hu>",
      response: "250 2.0.0 OK",
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      ...EMAIL,
      from: "BSS <noreply@bsstudio.hu>",
      replyTo: "bss-vez@simonyi.bme.hu",
    });
  });

  it("records no answer from a relay that sent none", async () => {
    mockSendMail.mockResolvedValue({ ...accepted(), response: undefined });

    await expect(sendEmail(EMAIL)).resolves.toMatchObject({ response: null });
  });

  it("connects with credentials and a timeout on every phase", async () => {
    await sendEmail(EMAIL);

    expect(transportOptions()).toMatchObject({
      host: "smtp.bsstudio.hu",
      port: 587,
      secure: false,
      auth: { user: "backstage", pass: "s3cret" },
      connectionTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
      greetingTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
      socketTimeout: EXTERNAL_REQUEST_TIMEOUT_MS,
    });
  });

  it("defaults to the submission port", async () => {
    vi.stubEnv("SMTP_PORT", "");
    await sendEmail(EMAIL);

    expect(transportOptions()).toMatchObject({ port: 587, secure: false });
  });

  it("wraps the session in TLS on the implicit-TLS port", async () => {
    vi.stubEnv("SMTP_PORT", "465");
    await sendEmail(EMAIL);

    expect(transportOptions()).toMatchObject({ port: 465, secure: true });
  });

  it.each([["SMTP_USER"], ["SMTP_PASSWORD"]])(
    "offers no AUTH when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");
      await sendEmail(EMAIL);

      expect(transportOptions()).toMatchObject({ auth: undefined });
    },
  );

  it("omits Reply-To when no reply address is configured", async () => {
    vi.stubEnv("SMTP_REPLY_TO", "");
    await sendEmail(EMAIL);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: undefined }),
    );
  });

  it.each([["SMTP_HOST"], ["SMTP_FROM"]])(
    "refuses to send without %s",
    async (name) => {
      vi.stubEnv(name, "");

      await expect(sendEmail(EMAIL)).rejects.toThrow(
        "Missing SMTP_HOST or SMTP_FROM",
      );
      expect(mockCreateTransport).not.toHaveBeenCalled();
    },
  );

  it("reports a relay that would not talk to us", async () => {
    mockSendMail.mockRejectedValue(new Error("Connection timeout"));

    await expect(sendEmail(EMAIL)).rejects.toThrow(EmailError);
    await expect(sendEmail(EMAIL)).rejects.toThrow(
      "Email error: Connection timeout",
    );
  });

  // A relay can take the session and still refuse the address.
  it("fails when no recipient was accepted", async () => {
    mockSendMail.mockResolvedValue({
      ...accepted(),
      accepted: [],
      rejected: [EMAIL.to],
    });

    await expect(sendEmail(EMAIL)).rejects.toThrow(
      "Email error: The relay accepted no recipient",
    );
  });

  it.each([
    ["a delivered message", () => mockSendMail.mockResolvedValue(accepted())],
    ["a failed one", () => mockSendMail.mockRejectedValue(new Error("nope"))],
  ])("closes the connection after %s", async (_case, arrange) => {
    arrange();

    await sendEmail(EMAIL).catch(() => {});

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
