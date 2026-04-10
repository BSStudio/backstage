"use client";

import { createContext, useContext, useEffect, useState } from "react";

type BreadcrumbOverrides = Record<string, string>;

const BreadcrumbContext = createContext<{
  overrides: BreadcrumbOverrides;
  setOverrides: (overrides: BreadcrumbOverrides) => void;
}>({
  overrides: {},
  setOverrides: () => {},
});

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [overrides, setOverrides] = useState<BreadcrumbOverrides>({});

  return (
    <BreadcrumbContext value={{ overrides, setOverrides }}>
      {children}
    </BreadcrumbContext>
  );
}

export function useBreadcrumbOverrides() {
  return useContext(BreadcrumbContext).overrides;
}

/**
 * Set breadcrumb label overrides for dynamic segments (e.g. UUIDs → member names).
 * Place this component anywhere inside a page that needs custom labels.
 */
export function BreadcrumbOverride({
  overrides,
}: {
  overrides: BreadcrumbOverrides;
}) {
  const { setOverrides } = useContext(BreadcrumbContext);

  useEffect(() => {
    setOverrides(overrides);
    return () => setOverrides({});
  }, [overrides, setOverrides]);

  return null;
}
