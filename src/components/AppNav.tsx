"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "workspace" },
  { href: "/app/activity", label: "activity" },
  { href: "/app/settings", label: "settings" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="app">
      {LINKS.map((l) => {
        const active =
          l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`rounded-btn px-3.5 py-1.5 text-sm font-bold lowercase transition-colors ${
              active ? "bg-ink text-cream" : "text-ink-soft hover:bg-cream-deep"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
