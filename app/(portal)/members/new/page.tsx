import type { Metadata } from "next";
import { isEmailConfigured } from "@/lib/email/smtp";
import { canManageMembers } from "@/lib/permissions";
import { pageActor } from "@/lib/session";
import { NewMemberForm } from "./new-member-form";

export const metadata: Metadata = { title: "Új tag - Backstage" };

export default async function NewMemberPage() {
  await pageActor(canManageMembers);

  return <NewMemberForm welcomeEmail={isEmailConfigured()} />;
}
