"use client";

import { createContext, useContext, useState } from "react";

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

  return (
    <AvatarContext value={{ avatarUrl, setAvatarUrl }}>
      {children}
    </AvatarContext>
  );
}

export function useAvatar() {
  return useContext(AvatarContext);
}
