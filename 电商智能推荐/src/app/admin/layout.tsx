import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent 管理端",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
