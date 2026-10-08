import { sendEmail } from "@/lib/email/smtp";
import { renderWelcomeEmail } from "@/lib/email/welcome";
import type { OperationHandlers } from "../executor";
import { buildWelcomeEmail } from "./payload";

// Read here rather than carried in the payload, so a retry goes to the address the row holds
// now. The username is the exception: nothing stores it, so the payload is its only source.
export const emailHandlers: OperationHandlers = {
  SEND_WELCOME_EMAIL: async (payload, memberId, prisma) => {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, email: true, archived: true },
    });
    /* v8 ignore next -- defense in depth; SyncJob.memberId is a required FK */
    if (!member) throw new Error(`Member not found: ${memberId}`);

    // Welcoming somebody who has since been let go is worse than a visible failed job.
    if (member.archived) {
      throw new Error("Member is archived; no welcome email is sent");
    }

    const { username } = payload as { username?: unknown };
    if (typeof username !== "string" || username === "") {
      throw new Error("Welcome email job carries no username");
    }

    const { subject, html, text } = renderWelcomeEmail(
      buildWelcomeEmail(member, username),
    );

    return sendEmail({ to: member.email, subject, html, text });
  },
};
