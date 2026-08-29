import type { Metadata } from "next";
import { canManageMembers } from "@/lib/permissions";
import { pageActor } from "@/lib/session";
import { NewMemberForm } from "./new-member-form";

export const metadata: Metadata = { title: "Új tag - Backstage" };

export default async function NewMemberPage() {
  await pageActor(canManageMembers);

  return <NewMemberForm />;
}
