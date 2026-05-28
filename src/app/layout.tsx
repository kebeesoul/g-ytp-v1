import type { Metadata } from "next";
import Link from "next/link";
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
          <Link href="/editor" className="vm-brand" aria-label="VIBEMASTER editor">
            <span className="text-white">VIBE</span><span className="vm-amber">MASTER</span>
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/editor"
              className="text-[11px] uppercase tracking-[0.18em] text-[var(--vm-subtle)] transition-colors hover:text-white"
            >
              Editor
            </Link>
            <Link
              href="/history"
              className="text-[11px] uppercase tracking-[0.18em] text-[var(--vm-subtle)] transition-colors hover:text-white"
            >
              History
            </Link>
            <Link
              href="/settings"
              className="text-[11px] uppercase tracking-[0.18em] text-[var(--vm-subtle)] transition-colors hover:text-white"
            >
              Settings
            </Link>
            <span className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--vm-subtle)] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--vm-cyan)]" />
              Ready
            </span>
          </nav>
        </header>
        <main className="flex flex-col flex-1">{children}</main>
      </body>
    </html>
  );
}
