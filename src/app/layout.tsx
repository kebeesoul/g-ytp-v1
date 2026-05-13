import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950">
        <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-3">
          <span className="text-sm font-semibold text-white">g-ytp-v1</span>
          <nav className="flex gap-4">
            <Link
              href="/editor"
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              Editor
            </Link>
            <Link
              href="/history"
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              History
            </Link>
          </nav>
        </header>
        <main className="flex flex-col flex-1">{children}</main>
      </body>
    </html>
  );
}
