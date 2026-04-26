import { NotFoundContent } from "@/components/not-found-content";
import { PortalShell } from "@/components/portal-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function NotFound() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <NotFoundContent />
      </div>
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true },
  });

  return (
    <PortalShell session={session} avatarUrl={member?.avatarUrl ?? null}>
      <NotFoundContent />
    </PortalShell>
  );
}
