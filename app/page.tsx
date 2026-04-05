import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 gap-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Image src="/logo.svg" alt="BSS" width={160} height={48} priority />
      <h1 className="text-3xl font-bold tracking-tight">Backstage</h1>
      <p className="text-muted-foreground">Budavári Schönherz Stúdió</p>
    </div>
  );
}
