"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ChevronUp,
  Gauge,
  MoreHorizontal,
  Radar,
  FlaskConical,
  Home,
  LayoutTemplate,
  PenLine,
  Plug,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { LogoHome } from "@/components/brand/LivingLogo";

/**
 * The app's navigation chrome: a compact left rail on desktop, a bottom bar
 * on mobile. The five everyday destinations, with the deeper tools folded
 * behind "more" — nothing else lives here (no upgrade ads, per the shell
 * rules). The approvals item carries a count badge ONLY when something
 * actually needs a signature. Advanced surfaces (memory, team, health,
 * automations, files) stay reachable from their in-page links and settings.
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
 * The deeper tools — FOLDED AWAY by default.
 *
 * These used to sit under a divider, which is a weaker idea than it looks: a
 * divider changes the spacing and nothing else, so the first screen still
 * presented eleven equal-weight destinations and still read as a control
 * panel. "simulate", "monitoring" and "live work" are not part of anybody's
 * normal day, and putting them at the same visual weight as "home" tells a
 * new person this is a product they have to learn.
 *
 * So the rail opens on the daily five and one "more". Nothing is removed and
 * nothing is more than one click further away; the group also opens itself
 * whenever the current page is inside it, so where you are is never hidden.
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
      className={`relative flex w-[60px] flex-col items-center gap-0.5 rounded-btn px-1 py-2 text-[10px] font-bold lowercase transition-colors ${
        active ? "bg-ink text-cream" : "text-ink-soft hover:bg-cream-deep hover:text-ink"
      }`}
    >
      <span className="relative">
        <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
        {badge > 0 && <Badge count={badge} />}
      </span>
      {label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

const MORE_KEY = "cosigno_rail_more";

/**
 * Whether the deeper tools are showing.
 *
 * Two things can open them: the person opened them (remembered, because
 * someone who lives in monitoring shouldn't re-open it every visit), or they
 * are currently ON one of those pages — a rail that hides the page you are
 * looking at is worse than one that shows too much.
 */
function useMoreOpen(pathname: string): [boolean, () => void] {
  const onSecondary = SECONDARY.some((s) => isActive(pathname, s.href));
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    try {
      setChosen(window.localStorage.getItem(MORE_KEY) === "1");
    } catch {
      // storage unavailable → the rail simply starts folded
    }
  }, []);
  const toggle = () => {
    setChosen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(MORE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };
  return [chosen || onSecondary, toggle];
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
 * Whether this workspace is on the free plan — the ONE condition under which
 * the rail shows an upgrade destination. Paid users manage their plan from
 * settings; putting an upgrade ad in front of someone already paying is the
 * pushiness the shell rules exist to prevent. Until the plan is known, the
 * item is absent (no flash of an ad that then disappears).
 */
function useIsFreePlan(): boolean {
  const [free, setFree] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => alive && setFree((d.plan?.id ?? "free") === "free"))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return free;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-signal px-1 text-[9px] font-extrabold text-on-signal">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Desktop: compact left rail (logo top, items, account handled by header). */
export function AppRail() {
  const pathname = usePathname();
  const pending = usePendingCount();
  const isFree = useIsFreePlan();
  const [moreOpen, toggleMore] = useMoreOpen(pathname);
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line/60 bg-cream/80 py-4 lg:flex"
      aria-label="app navigation"
    >
      <div className="mb-3">
        <LogoHome href="/app" label="cosigno home" size={28} variant="mark" />
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

      <span className="my-1 h-px w-7 bg-line" aria-hidden="true" />

      <button
        type="button"
        onClick={toggleMore}
        aria-expanded={moreOpen}
        aria-controls="rail-more"
        className="flex w-[60px] flex-col items-center gap-0.5 rounded-btn px-1 py-2 text-[10px] font-bold lowercase text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
      >
        {moreOpen ? (
          <ChevronUp size={17} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <MoreHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
        )}
        {moreOpen ? "less" : "more"}
      </button>

      {/* `hidden` rather than unmounted: the links stay in the accessibility
          tree's document order and nothing re-mounts on every toggle.
          The flex utility is applied only when open — `display: flex` from a
          class beats the `hidden` attribute's `display: none`, so leaving it
          on would render the group permanently visible. */}
      <div id="rail-more" hidden={!moreOpen} className={moreOpen ? "flex flex-col items-center gap-1" : undefined}>
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
      </div>

      {isFree && (
        <RailLink
          href="/pricing"
          label="upgrade"
          Icon={Sparkles}
          active={false}
          badge={0}
        />
      )}
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
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line/60 bg-cream/95 px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
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
