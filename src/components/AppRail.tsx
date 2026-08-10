"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  FlaskConical,
  Gauge,
  Home,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plug,
  Radar,
  Repeat2,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { LogoHome } from "@/components/brand/LivingLogo";

/**
 * The workspace navigation: a grouped sidebar on desktop, a bottom bar on
 * mobile.
 *
 * It used to be eleven equal-weight icons in one undifferentiated column,
 * which made a workspace read as a control panel — every destination shouting
 * at the same volume, and no way to tell the thing you do hourly from the
 * thing you do twice a year. They are now three named groups in the order a
 * day actually uses them: the workspace you live in, the execution surfaces
 * you supervise, and the integrations you configure once.
 *
 * The rail expands to labels and collapses to icons, and remembers which you
 * chose. Collapsed, every item keeps its accessible name and shows a tooltip
 * on hover — an icon-only rail that doesn't name its destinations is a
 * memory test.
 */

interface RailItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the collapsed tooltip and to screen readers. */
  hint: string;
}

interface RailGroup {
  title: string;
  items: RailItem[];
}

/**
 * The daily loop first: ask for work, watch it, decide on it, see what
 * happened. Everything in this group is used every single day.
 */
const GROUPS: RailGroup[] = [
  {
    title: "workspace",
    items: [
      { href: "/app", label: "home", icon: Home, hint: "today's work and the ask box" },
      { href: "/app/missions", label: "missions", icon: Rocket, hint: "everything you've delegated" },
      { href: "/app/activity", label: "activity", icon: Activity, hint: "the full history" },
    ],
  },
  {
    title: "execution",
    items: [
      { href: "/app/approvals", label: "approvals", icon: PenLine, hint: "decisions waiting on you" },
      { href: "/app/mission-control", label: "live work", icon: Radar, hint: "what's running right now" },
      { href: "/app/watch", label: "scheduled", icon: Repeat2, hint: "standing work and watches" },
      { href: "/app/monitoring", label: "monitoring", icon: Gauge, hint: "cost, limits and health" },
      { href: "/app/settings/rules", label: "simulate", icon: FlaskConical, hint: "test a rule before enabling it" },
    ],
  },
  {
    title: "integrations",
    items: [
      { href: "/app/connections", label: "connections", icon: Plug, hint: "the apps cosigno can work in" },
      { href: "/app/trust", label: "trust", icon: ShieldCheck, hint: "what cosigno may and may not do" },
      { href: "/app/templates", label: "templates", icon: LayoutTemplate, hint: "ready-made missions" },
      { href: "/app/account", label: "account", icon: Settings, hint: "plan, profile and preferences" },
    ],
  },
];

/** The daily five, for the phone. */
const MOBILE = [
  GROUPS[0].items[0],
  GROUPS[0].items[1],
  GROUPS[1].items[0],
  GROUPS[0].items[2],
  GROUPS[2].items[0],
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

/* ---------------------------------------------------------- pending count */

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

/* ------------------------------------------------------------ collapse state */

const COLLAPSE_KEY = "cosigno:rail-collapsed";

/**
 * Expanded or icons-only, remembered across sessions.
 *
 * It starts expanded and reads the stored preference after mount rather than
 * during render: the server has no way to know the choice, so branching on it
 * during the first render is a hydration mismatch and a visible width jump.
 * One frame of the default is the correct trade.
 */
function useCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* private mode — the default stands */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* preference simply doesn't persist */
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}

/* -------------------------------------------------------------------- bits */

function Badge({ count, floating }: { count: number; floating?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={
        floating
          ? "absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-signal px-1 text-[9px] font-extrabold text-on-signal"
          : "ml-auto flex h-4 min-w-4 items-center justify-center rounded-pill bg-signal px-1 text-[9px] font-extrabold tabular-nums text-on-signal"
      }
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * One rail destination.
 *
 * The selected state is a bar on the leading edge plus a tinted well, not an
 * inverted ink block. The ink block read as a button someone had pressed and
 * left down; a bar reads as "you are here", and it can animate into place
 * without the label flashing from cream to ink and back on every route change.
 */
function RailLink({
  item,
  active,
  collapsed,
  badge,
}: {
  item: RailItem;
  active: boolean;
  collapsed: boolean;
  badge: number;
}) {
  const { href, label, icon: Icon, hint } = item;
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      title={collapsed ? `${label} — ${hint}` : undefined}
      className={`group relative flex items-center rounded-btn text-[13px] font-bold lowercase transition-[background-color,color] duration-fast ease-brand-out ${
        collapsed ? "h-9 w-9 justify-center" : "h-9 gap-2.5 px-2.5"
      } ${
        active
          ? "bg-cream-deep text-ink"
          : "text-ink-soft hover:bg-cream-deep/60 hover:text-ink"
      }`}
    >
      {active && (
        <span
          className="absolute -left-2 top-1/2 h-4 w-[3px] -translate-y-1/2 animate-rail-mark rounded-pill bg-signal"
          aria-hidden="true"
        />
      )}
      <span className="relative shrink-0">
        <Icon
          size={16}
          strokeWidth={active ? 2.6 : 2.2}
          className={`transition-colors duration-fast ${active ? "text-signal" : ""}`}
          aria-hidden="true"
        />
        {collapsed && <Badge count={badge} floating />}
      </span>
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          <Badge count={badge} />
        </>
      )}
      {/* The collapsed rail keeps every destination named for screen readers,
          which a title attribute alone does not reliably do. */}
      {collapsed && <span className="sr-only">{label}</span>}
    </Link>
  );
}

/* -------------------------------------------------------------------- rail */

/** Desktop: the grouped sidebar. */
export function AppRail() {
  const pathname = usePathname();
  const pending = usePendingCount();
  const isFree = useIsFreePlan();
  const [collapsed, toggle] = useCollapsed();

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line/60 bg-cream/70 transition-[width] duration-base ease-brand-out lg:flex ${
        collapsed ? "w-[68px] px-3" : "w-[212px] px-4"
      } py-4`}
      aria-label="workspace navigation"
    >
      <div className={`mb-5 flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
        <LogoHome
          href="/app"
          label="cosigno home"
          size={26}
          variant={collapsed ? "mark" : "full"}
        />
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {collapsed ? (
              // A collapsed rail can't show a group name, so the grouping is
              // carried by a divider instead of vanishing entirely.
              <span className="mx-auto mb-1 h-px w-5 bg-line" aria-hidden="true" />
            ) : (
              <p className="mb-1 px-2.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft/70">
                {group.title}
              </p>
            )}
            {group.items.map((item) => (
              <RailLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={isActive(pathname, item.href)}
                badge={item.href === "/app/approvals" ? pending : 0}
              />
            ))}
          </div>
        ))}

        {isFree && (
          <div className="flex flex-col gap-0.5">
            <RailLink
              item={{
                href: "/pricing",
                label: "upgrade",
                icon: Sparkles,
                hint: "more operations and more connected apps",
              }}
              collapsed={collapsed}
              active={false}
              badge={0}
            />
          </div>
        )}
      </nav>

      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "expand navigation" : "collapse navigation"}
        className={`mt-3 flex h-8 items-center rounded-btn text-[11px] font-bold lowercase text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink ${
          collapsed ? "w-9 justify-center" : "gap-2 px-2.5"
        }`}
      >
        {collapsed ? (
          <PanelLeftOpen size={15} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <>
            <PanelLeftClose size={15} strokeWidth={2.2} aria-hidden="true" />
            collapse
          </>
        )}
      </button>
    </aside>
  );
}

/**
 * Mobile: fixed bottom bar.
 *
 * Only the daily five. Fourteen targets across a phone width leaves each one
 * about 25px — below the size a thumb can hit reliably, which turns every tap
 * into a coin flip. The rest stay reachable from the pages that use them and
 * from ⌘K.
 */
export function AppBottomNav() {
  const pathname = usePathname();
  const pending = usePendingCount();
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line/60 px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
      aria-label="workspace navigation"
    >
      {MOBILE.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-btn py-1 text-[9px] font-bold lowercase transition-colors duration-fast ${
              active ? "text-ink" : "text-ink-soft"
            }`}
          >
            <span
              className={`relative rounded-pill px-2.5 py-0.5 transition-colors duration-fast ${
                active ? "bg-signal/20" : ""
              }`}
            >
              <Icon
                size={17}
                strokeWidth={active ? 2.6 : 2.2}
                className={active ? "text-signal" : ""}
                aria-hidden="true"
              />
              {href === "/app/approvals" && <Badge count={pending} floating />}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
