"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };

    const start = () => {
      stop();
      timer = setInterval(() => router.refresh(), intervalMs);
    };

    const onVisibilityChange = () => {
      // Nobody is reading a hidden tab, and browsers throttle its timer anyway.
      if (document.hidden) {
        stop();
        return;
      }
      // Whatever is on screen was drawn before the tab was hidden, however long ago that was.
      router.refresh();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, intervalMs]);

  return null;
}
