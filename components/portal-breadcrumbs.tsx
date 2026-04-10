"use client";

import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { useBreadcrumbOverrides } from "@/components/breadcrumb-context";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NAV_LABELS } from "@/lib/nav-labels";

export function PortalBreadcrumbs() {
  const pathname = usePathname();
  const overrides = useBreadcrumbOverrides();
  const segments = pathname.split("/").filter(Boolean);

  // Don't show breadcrumbs on the dashboard
  if (segments.length === 0) return null;

  const crumbs: { label: string; href: string }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const href = `/${segments.slice(0, i + 1).join("/")}`;
    const label =
      overrides[segment] ??
      (NAV_LABELS as Record<string, string>)[segment] ??
      segment;
    crumbs.push({ label, href });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <Fragment key={crumb.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
