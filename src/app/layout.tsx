import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/layout/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "g-ytp-v1",
  description: "YouTube 플레이리스트 영상 자동화",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="vm-app flex min-h-full flex-col">
        <header className="vm-topbar">
          <Link href="/editor" className="vm-brand" aria-label="YTP MAKER editor">
            <span className="text-white">YTP MAKER</span>
            <span className="text-[var(--vm-muted)]"> | published by galaxymap</span>
          </Link>
          <TopNav />
        </header>
        <main className="flex flex-col flex-1">{children}</main>
      </body>
    </html>
  );
}
