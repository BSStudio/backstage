import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { getSession } from "@/lib/session";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return <PortalShell session={session}>{children}</PortalShell>;
}
