import { AppSidebar } from "@/components/app-sidebar";
import { AvatarProvider } from "@/components/avatar-context";
import { BreadcrumbProvider } from "@/components/breadcrumb-context";
import { PortalBreadcrumbs } from "@/components/portal-breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/user-menu";
import prisma from "@/lib/prisma";
import type { Session } from "@/lib/session";

export async function PortalShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const role = session.user.role;

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true },
  });

  return (
    <AvatarProvider initialUrl={member?.avatarUrl ?? null}>
      <BreadcrumbProvider>
        <SidebarProvider>
          <AppSidebar role={role} />
          <SidebarInset>
            <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-1" />
              <PortalBreadcrumbs />
              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle />
                <UserMenu
                  id={session.user.id}
                  firstName={session.user.firstName ?? ""}
                  lastName={session.user.lastName ?? ""}
                  email={session.user.email ?? ""}
                />
              </div>
            </header>
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </BreadcrumbProvider>
    </AvatarProvider>
  );
}
