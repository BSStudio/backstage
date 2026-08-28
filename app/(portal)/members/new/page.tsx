import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canManageMembers } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import type { UserRole } from "@/types";
import { NewMemberForm } from "./new-member-form";

export const metadata: Metadata = { title: "Új tag - Backstage" };

export default async function NewMemberPage() {
  const session = await getSession();
  if (!canManageMembers(session?.user.role as UserRole | undefined)) {
    redirect("/");
  }

  return <NewMemberForm />;
}
