"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Gauge,
  Radar,
  FlaskConical,
  Home,
  LayoutTemplate,
  PenLine,
  Plug,
  Rocket,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { LogoHome } from "@/components/brand/LivingLogo";

/**
 * The app's navigation chrome: a compact left rail on desktop, a bottom bar
 * on mobile.
 *
 * The rail is furniture, so it is built to be ignored: one weight of type, one
 * icon size, and an active state that is a soft surface rather than a slab of
 * black. Nothing in it advertises anything — an upgrade prompt in the
 * navigation is an ad in the one part of the product a person has to look at
 * every minute, so plan changes live in the account menu instead.
 */

/**
 * The daily loop: ask for work, watch it, decide on it, see what happened,
 * and manage what cosigno can touch. Five things, in the order a day uses
 * them.
 */
const PRIMARY = [
  { href: "/app", label: "home", icon: Home },
  { href: "/app/missions", label: "missions", icon: Rocket },
  { href: "/app/approvals", label: "approvals", icon: PenLine },
  { href: "/app/activity", label: "activity", icon: Activity },
  { href: "/app/connections", label: "connections", icon: Plug },
] as const;

/**
 * The deeper tools. Every one of them still works and is one click away —
 * they sit below a divider because none of them is part of a normal day, and
 * eleven equal-weight destinations made the first screen read as a control
 * panel rather than a workspace.
 */
const SECONDARY = [
  { href: "/app/trust", label: "trust", icon: ShieldCheck },
  { href: "/app/monitoring", label: "monitoring", icon: Gauge },
  { href: "/app/mission-control", label: "live work", icon: Radar },
  /* Digital twins are gone — "capabilities" went with them, and everything it
     showed now lives on Connections. "simulate" points straight at the rule
     tester rather than through /app/simulation, which only redirects. */
  { href: "/app/settings/rules", label: "simulate", icon: FlaskConical },
  { href: "/app/templates", label: "templates", icon: LayoutTemplate },
  // /app/settings redirects here; the surface it opens is titled "account",
  // so the rail says the same word rather than a second name for one place.
  { href: "/app/account", label: "account", icon: Settings },
] as const;



/** One rail destination. Both groups render through this. */
function RailLink({
  href,
  label,
  Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badge: number;
}) {
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      className={`relative flex w-[64px] flex-col items-center gap-1 rounded-btn px-1 py-2.5 text-[0.6875rem] font-semibold lowercase tracking-wide transition-colors duration-fast ease-brand-out ${
        active ? "bg-ink/[0.07] text-ink" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink"
      }`}
    >
      <span className="relative">
        <Icon size={17} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
        {badge > 0 && <Badge count={badge} />}
      </span>
      {label}
    </Link>
  );
}

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

/**
 * The count of decisions waiting on you — the only number the navigation is
 * allowed to show, because it is the only one that changes what you do next.
 */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1 flex h-[15px] min-w-[15px] animate-check-pop items-center justify-center rounded-pill bg-signal px-1 text-[0.6875rem] font-semibold tabular-nums text-ink">
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
      className="sticky top-0 hidden h-screen w-[80px] shrink-0 flex-col items-center gap-0.5 border-r border-line/40 bg-cream py-5 lg:flex"
      aria-label="app navigation"
    >
      <div className="mb-5">
        <LogoHome href="/app" label="cosigno home" size={26} variant="mark" />
      </div>
      {PRIMARY.map(({ href, label, icon: Icon }) => (
        <RailLink
          key={href}
          href={href}
          label={label}
          Icon={Icon}
          active={isActive(pathname, href)}
          badge={label === "approvals" ? pending : 0}
        />
      ))}

      <span className="my-3 h-px w-8 bg-line/70" aria-hidden="true" />

      {SECONDARY.map(({ href, label, icon: Icon }) => (
        <RailLink
          key={href}
          href={href}
          label={label}
          Icon={Icon}
          active={isActive(pathname, href)}
          badge={0}
        />
      ))}
    </aside>
  );
}

/**
 * Mobile: fixed bottom bar.
 *
 * Only the daily five. Eleven targets across a phone width leaves each one
 * about 32px — below the size a thumb can hit reliably, which turns every tap
 * into a coin flip. The deeper tools stay reachable from the pages that use
 * them and from ⌘K.
 */
export function AppBottomNav() {
  const pathname = usePathname();
  const pending = usePendingCount();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line/40 bg-cream/92 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden"
      aria-label="app navigation"
    >
      {PRIMARY.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-btn py-1 text-[0.6875rem] font-semibold lowercase tracking-wide transition-colors duration-fast ${
              active ? "text-ink" : "text-ink-soft"
            }`}
          >
            <span
              className={`relative rounded-pill px-3 py-1 transition-colors duration-fast ${
                active ? "bg-ink/[0.07]" : ""
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
              {label === "approvals" && <Badge count={pending} />}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
