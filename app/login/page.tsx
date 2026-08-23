"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

function LoginButton() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const handleLogin = async () => {
    setLoading(true);
    const callback = searchParams.get("callbackUrl");
    const safeCallback =
      callback?.startsWith("/") && !callback.startsWith("//") ? callback : "/";
    await authClient.signIn.social({
      provider: "authentik",
      callbackURL: safeCallback,
    });
  };

  return (
    <Button className="w-full" onClick={handleLogin} disabled={loading}>
      {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
      Bejelentkezés
    </Button>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="justify-items-center text-center">
          <Image
            src="/logo.svg"
            alt="BSS"
            width={120}
            height={36}
            className="mb-2"
            priority
          />
          <CardTitle className="text-2xl">Backstage</CardTitle>
          <CardDescription>
            Budavári Schönherz Stúdió belső portál
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* `useSearchParams` bails out of prerendering without a boundary. */}
          <Suspense
            fallback={
              <Button className="w-full" disabled>
                Bejelentkezés
              </Button>
            }
          >
            <LoginButton />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
