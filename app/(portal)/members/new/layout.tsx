import type { Metadata } from "next";

export const metadata: Metadata = { title: "Új tag - Backstage" };

export default function NewMemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
