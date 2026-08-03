"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Home,
  LayoutTemplate,
  PenLine,
  Plug,
  Rocket,
  Settings,
} from "lucide-react";
import { LogoHome } from "@/components/brand/LivingLogo";

/**
 * The app's navigation chrome: a compact left rail on desktop, a bottom bar
 * on mobile. The seven everyday destinations — nothing else lives here (no
 * upgrade ads, per the shell rules). The approvals item carries a count badge
 * ONLY when something actually needs a signature. Advanced surfaces (memory,
 * team, health, automations, files) stay reachable from their in-page links
 * and settings.
 */

const ITEMS = [
  { href: "/app", label: "home", icon: Home },
  { href: "/app/missions", label: "missions", icon: Rocket },
  { href: "/app/approvals", label: "approvals", icon: PenLine },
  { href: "/app/activity", label: "activity", icon: Activity },
  { href: "/app/connections", label: "connections", icon: Plug },
  { href: "/app/templates", label: "templates", icon: LayoutTemplate },
  { href: "/app/settings", label: "settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

/**
 * Pending-approval count — ONE shared poller for however many nav surfaces
 * are mounted (the rail and the bottom bar render together, one CSS-hidden),
 * so the app fires a single request per interval instead of one per surface.
 * Polling pauses while the tab is hidden and refreshes on return.
 */
let pendingCount = 0;
const pendingSubs = new Set<(n: number) => void>();
let pendingTimer: ReturnType<typeof setInterval> | null = null;

async function loadPending() {
  if (document.visibilityState === "hidden") return;
  try {
    const res = await fetch("/api/actions?status=proposed&limit=20");
    if (!res.ok) return;
    const data = await res.json();
    pendingCount = (data.actions ?? []).length;
    pendingSubs.forEach((fn) => fn(pendingCount));
  } catch {
    /* quiet — the badge is a hint, not a source of truth */
  }
}

function onPendingVisible() {
  if (document.visibilityState === "visible") loadPending();
}

function subscribePending(fn: (n: number) => void): () => void {
  pendingSubs.add(fn);
  fn(pendingCount);
  if (pendingSubs.size === 1) {
    loadPending();
    pendingTimer = setInterval(loadPending, 30_000);
    document.addEventListener("visibilitychange", onPendingVisible);
  }
  return () => {
    pendingSubs.delete(fn);
    if (pendingSubs.size === 0 && pendingTimer) {
      clearInterval(pendingTimer);
      pendingTimer = null;
      document.removeEventListener("visibilitychange", onPendingVisible);
    }
  };
}

function usePendingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => subscribePending(setCount), []);
  return count;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-signal px-1 text-[9px] font-extrabold text-ink">
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
              {label === "approvals" && <Badge count={pending} />}
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
              {label === "approvals" && <Badge count={pending} />}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
