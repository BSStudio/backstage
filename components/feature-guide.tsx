"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FEATURE_GUIDE_QUERY,
  type FeatureContext,
  featureHighlights,
} from "@/lib/features";

export function FeatureGuide(context: FeatureContext) {
  const router = useRouter();
  const pathname = usePathname();
  const open = useSearchParams().get(FEATURE_GUIDE_QUERY) === "1";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) router.replace(pathname, { scroll: false });
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mit tud a Backstage?</DialogTitle>
          <DialogDescription>
            Amit nem feltétlenül találsz meg magadtól.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-4">
          {featureHighlights(context).map(
            ({ key, icon: Icon, title, description, href, linkLabel }) => (
              <li key={key} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold leading-tight">
                    {title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {description}
                  </span>
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {linkLabel}
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </li>
            ),
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
