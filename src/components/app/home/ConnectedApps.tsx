"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { HomeApp } from "@/lib/home/model";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { spotlight } from "@/components/ui/Surface";
import { RelativeTime, checkedFormat } from "@/components/ui/RelativeTime";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * The apps cosigno can work in, on the page rather than three clicks away.
 *
 * Each card carries the two facts that matter about a connector: whether it
 * is working, and when cosigno last confirmed that. The second is the one
 * usually missing — a connector that quietly expired looks identical to a
 * healthy one until a mission fails at 2am because of it, so the last check
 * is printed rather than implied.
 *
 * No green dots. Health here is the brand's own vocabulary: a working app is
 * quiet, and one needing attention wears the orange it earned.
 */

export function ConnectedApps({ apps }: { apps: HomeApp[] }) {
  return (
    // Fluid columns: full-width this flows 3–4 across; inside home's 320px
    // rail it stacks to one column of readable cards instead of cramming
    // four 70px stubs. One layout rule, every container width.
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
      {apps.map((app, i) => {
        const attention = app.health === "attention";
        return (
          <Link
            key={app.connectionId}
            href="/app/connections"
            prefetch
            onPointerMove={spotlight}
            style={staggerDelay(i, STAGGER_MS.tiles)}
            className={`spot group relative flex animate-tile-in items-center gap-2.5 rounded-card bg-surface/70 p-3 shadow-e1 ring-1 ring-inset transition-[transform,box-shadow] duration-fast ease-brand-out hover:-translate-y-0.5 hover:shadow-e3 active:translate-y-0 motion-reduce:hover:translate-y-0 ${
              attention ? "ring-signal/40" : "ring-line/60"
            }`}
          >
            <span className="transition-transform duration-base ease-spring group-hover:scale-110 motion-reduce:group-hover:scale-100">
              <ConnectorLogo
                kind={app.kind === "mcp" ? "mcp" : "app"}
                providerKey={app.providerKey}
                displayName={app.name}
                size={30}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-extrabold">{app.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-pill ${
                    attention
                      ? "bg-signal"
                      : app.health === "ok"
                        ? "bg-ink/35"
                        : "bg-ink-soft/40"
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`truncate text-[10px] font-bold lowercase ${
                    attention ? "text-signal" : "text-ink-soft"
                  }`}
                >
                  {app.healthLabel}
                </span>
              </span>
              {/* Relative, but never computed during SSR — see RelativeTime. */}
              <RelativeTime
                iso={app.lastCheckedAt}
                format={checkedFormat}
                className="mt-0.5 block truncate text-[10px] font-semibold text-ink-soft/80"
              />
            </span>
          </Link>
        );
      })}

      {/* The way to add one more sits in the grid rather than in a header —
          "connect another app" is the next move from this section, so it
          belongs where the eye already is. */}
      <Link
        href="/app/connections"
        prefetch
        style={staggerDelay(apps.length, STAGGER_MS.tiles)}
        className="group flex animate-tile-in items-center gap-2.5 rounded-card border border-dashed border-line p-3 text-left transition-[transform,border-color,background-color] duration-fast ease-brand-out hover:-translate-y-0.5 hover:border-signal/50 hover:bg-surface/50 motion-reduce:hover:translate-y-0"
      >
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-btn bg-cream-deep text-ink-soft transition-colors duration-fast group-hover:bg-signal/15 group-hover:text-signal"
          aria-hidden="true"
        >
          <Plus size={15} strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-extrabold">connect an app</span>
          <span className="mt-0.5 block text-[10px] font-semibold leading-snug text-ink-soft">
            every app you add is more cosigno can do
          </span>
        </span>
      </Link>
    </div>
  );
}
