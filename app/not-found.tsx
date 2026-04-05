import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";

function NotFoundContent() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-6xl font-bold tracking-tight">404</h1>
        <p className="text-xl font-medium">Az oldal nem található</p>
        <p className="text-muted-foreground">
          A keresett oldal nem létezik, vagy áthelyezésre került.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Vissza a főoldalra</Link>
      </Button>
    </div>
  );
}

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
