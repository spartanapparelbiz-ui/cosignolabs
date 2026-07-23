"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The seven everyday pages. Advanced surfaces (memory, team, health) are
// reachable from the account/settings menu, not the main nav — the dashboard
// stays about the four simple questions.
const LINKS = [
  { href: "/app", label: "home" },
  { href: "/app/missions", label: "missions" },
  { href: "/app/approvals", label: "approvals" },
  { href: "/app/automations", label: "automations" },
  { href: "/app/connections", label: "connections" },
  { href: "/app/files", label: "files" },
  { href: "/app/activity", label: "activity" },
];

function activeIndex(pathname: string): number {
  const i = LINKS.findIndex((l) =>
    l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href)
  );
  return i < 0 ? 0 : i;
}

export function AppNav() {
  const pathname = usePathname();
  const idx = activeIndex(pathname);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // The active-item pill slides between links (layout-animated) by tracking
  // the active anchor's offset. Recomputes on route change and resize.
  useLayoutEffect(() => {
    const el = refs.current[idx];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [idx, pathname]);

  useEffect(() => {
    function onResize() {
      const el = refs.current[idx];
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [idx]);

  return (
    <nav
      className="relative flex max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="app"
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full rounded-btn bg-ink transition-[left,width] duration-base ease-brand-out"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {LINKS.map((l, i) => {
        const active = i === idx;
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-current={active ? "page" : undefined}
            className={`relative z-10 shrink-0 rounded-btn px-3 py-1.5 text-sm font-bold lowercase transition-colors duration-base ${
              active ? "text-cream" : "text-ink-soft hover:bg-cream-deep"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
