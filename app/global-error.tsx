"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import "./globals.css";

// `onRequestError` is server-side only, so this is what reports a React render
// error in the browser.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [theme, setTheme] = useState("");

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // Mirrors next-themes: same storage key, same `defaultTheme="dark"` fallback.
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else if (stored === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      setTheme(prefersDark ? "dark" : "light");
    } else {
      setTheme("dark");
    }
  }, []);

  return (
    <html lang="hu" className={`${theme} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <title>Hiba történt · Backstage</title>
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-6xl font-bold tracking-tight">Hoppá</h1>
            <p className="text-xl font-medium">Váratlan hiba történt</p>
            <p className="text-muted-foreground">
              A hibát jelentettük, és megnézzük. Próbáld újra, vagy térj vissza
              a főoldalra.
            </p>
            {error.digest && (
              <p className="text-muted-foreground font-mono text-xs">
                Azonosító: {error.digest}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => unstable_retry()}>Újrapróbálkozás</Button>
            <Button variant="outline" asChild>
              <a href="/">Vissza a főoldalra</a>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
