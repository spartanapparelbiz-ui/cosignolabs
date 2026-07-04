"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Workspace" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/settings", label: "Settings" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="App">
      {LINKS.map((l) => {
        const active =
          l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-pill px-3.5 py-1.5 text-sm font-bold transition-colors ${
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
