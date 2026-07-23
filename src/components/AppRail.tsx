"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookLock,
  Home,
  Plug,
  Radar,
  Receipt,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { LogoHome } from "@/components/brand/LivingLogo";

/**
 * The app's navigation chrome: a compact left rail on desktop, a bottom bar
 * on mobile. The everyday destinations — nothing else lives here (no upgrade
 * ads, per the shell rules). "Needs Me" carries a count badge ONLY when
 * something actually needs you. Advanced surfaces (team, health, automations,
 * files, activity, templates) stay reachable from their in-page links and
 * Memory & Rules / Security.
 */

const ITEMS = [
  { href: "/app", label: "home", icon: Home },
  { href: "/app/needs-me", label: "needs me", icon: Radar },
  { href: "/app/missions", label: "missions", icon: Rocket },
  { href: "/app/receipts", label: "receipts", icon: Receipt },
  { href: "/app/connections", label: "connections", icon: Plug },
  { href: "/app/memory", label: "memory & rules", icon: BookLock },
  { href: "/app/security", label: "security", icon: ShieldCheck },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

/** Pending-approval count — polled quietly; badge renders only when > 0. */
function usePendingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/actions?status=proposed&limit=20");
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setCount((data.actions ?? []).length);
      } catch {
        /* quiet — the badge is a hint, not a source of truth */
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return count;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[9px] font-extrabold text-ink">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Desktop: compact left rail (logo top, items, account handled by header). */
export function AppRail() {
  const pathname = usePathname();
  const pending = usePendingCount();
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line/60 bg-cream/80 py-4 lg:flex"
      aria-label="app navigation"
    >
      <div className="mb-3">
        <LogoHome href="/app" label="cosigno home" size={30} textClass="hidden" />
      </div>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`relative flex w-[60px] flex-col items-center gap-0.5 rounded-btn px-1 py-2 text-[10px] font-bold lowercase transition-colors ${
              active ? "bg-ink text-cream" : "text-ink-soft hover:bg-cream-deep hover:text-ink"
            }`}
          >
            <span className="relative">
              <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
              {label === "needs me" && <Badge count={pending} />}
            </span>
            {label}
          </Link>
        );
      })}
    </aside>
  );
}

/** Mobile: fixed bottom bar, all seven items as compact icon+label targets. */
export function AppBottomNav() {
  const pathname = usePathname();
  const pending = usePendingCount();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line/60 bg-cream/95 px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
      aria-label="app navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-btn py-1 text-[9px] font-bold lowercase ${
              active ? "text-ink" : "text-ink-soft"
            }`}
          >
            <span className={`relative rounded-pill px-2.5 py-0.5 ${active ? "bg-signal/20" : ""}`}>
              <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
              {label === "needs me" && <Badge count={pending} />}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
