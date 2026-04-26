"use client";

import { createContext, useContext, useMemo, useState } from "react";

const AvatarContext = createContext<{
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
}>({
  avatarUrl: null,
  setAvatarUrl: () => {},
});

export function AvatarProvider({
  initialUrl,
  children,
}: {
  initialUrl: string | null;
  children: React.ReactNode;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialUrl);

  const value = useMemo(() => ({ avatarUrl, setAvatarUrl }), [avatarUrl]);

  return <AvatarContext value={value}>{children}</AvatarContext>;
}

export function useAvatar() {
  return useContext(AvatarContext);
}
