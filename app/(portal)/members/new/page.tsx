import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canManageMembers } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { NewMemberForm } from "./new-member-form";

export const metadata: Metadata = { title: "Új tag - Backstage" };

export default async function NewMemberPage() {
  const session = await getSession();
  if (!canManageMembers(session?.user.role)) {
    redirect("/");
  }

  return <NewMemberForm />;
}
