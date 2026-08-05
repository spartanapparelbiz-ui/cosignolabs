"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";

/**
 * The part of home that belongs to this company specifically.
 *
 * Nothing here is a fixed widget. Panels come from live connections; apps that
 * aren't connected become invitations that say what they would show. An
 * unconnected app never renders a metric, because "Revenue $0" reads as a
 * measurement of an empty business rather than a missing connection — and the
 * reader has no way to tell the two apart.
 */

interface Fact {
  label: string;
  value: number;
  atLeast?: boolean;
}
interface Panel {
  key: string;
  name: string;
  providerKey: string | null;
  facts: Fact[];
  note: string | null;
  /** What's happening in this app right now. Absent when nothing is. */
  activity?: { text: string; href: string };
}
interface Invitation {
  providerKey: string;
  name: string;
  tracks: string;
  available: boolean;
}
interface Dashboard {
  panels: Panel[];
  invitations: Invitation[];
  health: string[];
}

export function AdaptiveDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setData(d))
      .catch(() => {
        /* the rest of home is unaffected — this section simply doesn't render */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  // Show at most two invitations. A wall of apps you haven't connected is an
  // advert, and it buries the company's actual work underneath it.
  const invites = data.invitations.filter((i) => i.available).slice(0, 2);
  if (data.panels.length === 0 && invites.length === 0 && data.health.length === 0) return null;

  return (
    <section className="mb-5 flex flex-col gap-3">
      {/* Health, as sentences. Never a score — a number out of 100 implies a
          measurement nobody took. */}
      {data.health.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.health.map((h) => {
            const fine = /^everything looks healthy/i.test(h);
            return (
              <li key={h} className="flex items-start gap-2 text-xs font-semibold">
                {fine ? (
                  <Check size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                ) : (
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                )}
                <span>{h}</span>
              </li>
            );
          })}
        </ul>
      )}

      {(data.panels.length > 0 || invites.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.panels.map((p) => (
            <div key={p.key} className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
              <div className="flex items-center gap-2">
                {p.providerKey && (
                  <ConnectorLogo kind="app" providerKey={p.providerKey} displayName={p.name} size={18} />
                )}
                <p className="text-[11px] font-extrabold">{p.name}</p>
              </div>

              {p.facts.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {p.facts.slice(0, 4).map((f) => (
                    <li key={f.label} className="flex items-baseline gap-1.5">
                      <span className="font-display text-base font-bold tabular-nums">
                        {/* A capped total renders as "100+", never as an exact
                            number it isn't. */}
                        {f.value.toLocaleString()}
                        {f.atLeast ? "+" : ""}
                      </span>
                      <span className="text-[11px] leading-tight text-ink-soft">{f.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                // A panel shows facts OR the reason there are none. Never a zero
                // standing in for an unknown.
                <p className="mt-2 text-[11px] text-ink-soft">
                  {p.note ?? "cosigno can't read counts from this one yet."}
                </p>
              )}

              {/* What's going on in here — the question people actually open
                  the page with. Links to the work, so the panel isn't a dead
                  end. Absent when nothing is running: an "idle" label while a
                  mission quietly waits on a decision is worse than silence. */}
              {p.activity && (
                <Link
                  href={p.activity.href}
                  className="mt-2 flex items-center gap-1.5 border-t border-line/60 pt-2 text-[11px] font-bold hover:underline underline-offset-2"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-signal" aria-hidden="true" />
                  {p.activity.text}
                </Link>
              )}
            </div>
          ))}

          {invites.map((i) => (
            <Link
              key={i.providerKey}
              href="/app/connections"
              className="group rounded-card border border-dashed border-line bg-surface/40 p-4 transition-colors hover:border-signal hover:bg-surface"
            >
              <div className="flex items-center gap-2">
                <ConnectorLogo kind="app" providerKey={i.providerKey} displayName={i.name} size={18} />
                <p className="text-[11px] font-extrabold">Connect {i.name}</p>
                <Plus size={12} className="ml-auto text-ink-soft group-hover:text-signal" aria-hidden="true" />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-ink-soft">
                Track {i.tracks} here.
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
