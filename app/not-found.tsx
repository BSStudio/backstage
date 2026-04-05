import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 gap-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
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
