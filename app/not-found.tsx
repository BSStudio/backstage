import { NotFoundContent } from "@/components/not-found-content";
import { PortalShell } from "@/components/portal-shell";
import { ThemeToggle } from "@/components/theme-toggle";
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

  return (
    <PortalShell session={session}>
      <NotFoundContent />
    </PortalShell>
  );
}
