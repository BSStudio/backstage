import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true },
  });

  return (
    <PortalShell session={session} avatarUrl={member?.avatarUrl ?? null}>
      {children}
    </PortalShell>
  );
}
