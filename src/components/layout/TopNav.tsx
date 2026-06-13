"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/editor", label: "Editor" },
  { href: "/history", label: "History" },
  { href: "/thumbnail", label: "Thumbnail" },
  { href: "/ytmp3", label: "YTMP3" },
  { href: "/settings", label: "Overlay" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] transition-colors hover:text-white",
              active ? "text-[var(--vm-cyan)]" : "text-[var(--vm-subtle)]",
            ].join(" ")}
          >
            {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--vm-cyan)]" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
