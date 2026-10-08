import { sendEmail } from "@/lib/email/smtp";
import { renderWelcomeEmail } from "@/lib/email/welcome";
import type { OperationHandlers } from "../executor";
import { buildWelcomeEmail } from "./payload";

// The address is read here rather than carried in the payload, so a retry goes to what the
// member row says now: a letter that failed because the address was mistyped reaches the
// corrected one. The username cannot be read the same way — nothing stores it — so it is
// the one thing the payload carries.
export const emailHandlers: OperationHandlers = {
  SEND_WELCOME_EMAIL: async (payload, memberId, prisma) => {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, email: true, archived: true },
    });
    /* v8 ignore next -- defense in depth; SyncJob.memberId is a required FK */
    if (!member) throw new Error(`Member not found: ${memberId}`);

    // Only reachable by retrying a letter that failed before the member was archived.
    // Welcoming somebody who has been let go is worse than a visible failed job.
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
