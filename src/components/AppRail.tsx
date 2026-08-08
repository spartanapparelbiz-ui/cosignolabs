"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Gauge,
  Radar,
  FlaskConical,
  Home,
  LayoutTemplate,
  MoreHorizontal,
  PenLine,
  Plug,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { LogoHome } from "@/components/brand/LivingLogo";
import { LinkPending } from "@/components/app/NavProgress";
import { useResource } from "@/lib/client/resource";
import { PENDING_APPROVALS_KEY } from "@/lib/client/keys";

/**
 * The app's navigation chrome: a compact left rail on desktop, a bottom bar
 * on mobile. The seven everyday destinations — nothing else lives here (no
 * upgrade ads, per the shell rules). The approvals item carries a count badge
 * ONLY when something actually needs a signature. Advanced surfaces (memory,
 * team, health, automations, files) stay reachable from their in-page links
 * and settings.
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
      className={`group relative flex w-[60px] flex-col items-center gap-0.5 rounded-btn px-1 py-2 text-[10px] font-bold lowercase transition-all duration-fast ease-brand-out ${
        active
          ? "bg-ink text-cream"
          : "text-ink-soft hover:bg-cream-deep hover:text-ink active:scale-95"
      }`}
    >
      {/* Reports this link's pending state to the chrome's progress hairline. */}
      <LinkPending />
      <span className="relative transition-transform duration-fast ease-brand-out group-hover:-translate-y-px">
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

/**
 * The two facts the rail needs, both read through the shared client cache.
 *
 * This used to run its own poller and its own plan fetch, which meant every
 * page in the workspace paid for `/api/actions` and `/api/usage` a second time
 * — the page itself was already asking. Now the rail asks the same questions
 * as everyone else and the network sees one of each.
 */
function usePendingCount(): number {
  // Polled: the badge is how someone finds out a decision arrived while they
  // were on another page, so it has to keep looking.
  const { data } = useResource<{ actions?: unknown[] }>(PENDING_APPROVALS_KEY, {
    refreshMs: 30_000,
  });
  return (data?.actions ?? []).length;
}

/**
 * Whether this workspace is on the free plan — the ONE condition under which
 * the rail shows an upgrade destination. Paid users manage their plan from
 * settings; putting an upgrade ad in front of someone already paying is the
 * pushiness the shell rules exist to prevent. Until the plan is known, the
 * item is absent (no flash of an ad that then disappears).
 */
function useIsFreePlan(): boolean {
  const { data } = useResource<{ plan?: { id?: string } }>("/api/usage");
  return data ? (data.plan?.id ?? "free") === "free" : false;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-signal px-1 text-[9px] font-extrabold text-ink">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * Desktop: the compact left rail.
 *
 * Twelve equal-weight destinations is a control panel, not a workspace — every
 * one of them competing, none of them answering "where am I and what do I do
 * next". The five that make up a day stay open; the six deeper tools fold
 * behind one "more", which auto-opens whenever you are standing in one of them
 * so it is never possible to be somewhere the rail doesn't show. Everything
 * stays one click away, and all of it stays in ⌘K.
 */
export function AppRail() {
  const pathname = usePathname();
  const pending = usePendingCount();
  const isFree = useIsFreePlan();
  const inSecondary = SECONDARY.some((item) => isActive(pathname, item.href));
  const [showMore, setShowMore] = useState(false);
  const expanded = showMore || inSecondary;

  return (
    <aside
      className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line/60 bg-cream/80 py-4 lg:flex"
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

      {!expanded && (
        <button
          onClick={() => setShowMore(true)}
          aria-expanded={false}
          className="group flex w-[60px] flex-col items-center gap-0.5 rounded-btn px-1 py-2 text-[10px] font-bold lowercase text-ink-soft transition-all duration-fast ease-brand-out hover:bg-cream-deep hover:text-ink active:scale-95"
        >
          <MoreHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
          more
        </button>
      )}

      {expanded &&
        SECONDARY.map(({ href, label, icon: Icon }) => (
          <RailLink
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            active={isActive(pathname, href)}
            badge={0}
          />
        ))}

      {expanded && !inSecondary && (
        <button
          onClick={() => setShowMore(false)}
          aria-expanded
          className="mt-0.5 rounded-btn px-2 py-1 text-[10px] font-bold lowercase text-ink-soft/70 transition-colors hover:text-ink"
        >
          less
        </button>
      )}

      {isFree && (
        <RailLink href="/pricing" label="upgrade" Icon={Sparkles} active={false} badge={0} />
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
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-btn py-1 text-[9px] font-bold lowercase transition-transform duration-fast ease-brand-out active:scale-95 ${
              active ? "text-ink" : "text-ink-soft"
            }`}
          >
            <LinkPending />
            <span
              className={`relative rounded-pill px-2.5 py-0.5 transition-colors duration-fast ${
                active ? "bg-signal/20" : ""
              }`}
            >
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
