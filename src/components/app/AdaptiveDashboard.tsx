"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { useCountUp } from "@/lib/useCountUp";
import { card, dot } from "@/components/ui/styles";

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
    <section className="mb-12 flex flex-col gap-5">
      {/* Health, as sentences. Never a score — a number out of 100 implies a
          measurement nobody took. */}
      {data.health.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.health.map((h) => {
            const fine = /^everything looks healthy/i.test(h);
            return (
              <li key={h} className="t-body flex items-start gap-2.5">
                <span
                  className={`${dot(fine ? "positive" : "signal")} mt-[9px]`}
                  aria-hidden="true"
                />
                <span>{h}</span>
              </li>
            );
          })}
        </ul>
      )}

      {(data.panels.length > 0 || invites.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.panels.map((p) => (
            <div key={p.key} className={`${card()} p-5`}>
              <div className="flex items-center gap-2.5">
                {p.providerKey && (
                  <ConnectorLogo kind="app" providerKey={p.providerKey} displayName={p.name} size={16} />
                )}
                <p className="text-[0.875rem] font-semibold">{p.name}</p>
              </div>

              {p.facts.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {p.facts.slice(0, 4).map((f) => (
                    <li key={f.label} className="flex items-baseline gap-2">
                      <FactNumber value={f.value} atLeast={f.atLeast} />
                      <span className="t-caption">{f.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                // A panel shows facts OR the reason there are none. Never a zero
                // standing in for an unknown.
                <p className="t-caption mt-3">
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
                  className="mt-4 flex items-center gap-2 border-t border-line/40 pt-3 text-[0.8125rem] underline-offset-2 hover:underline"
                >
                  <span className={`${dot("signal")} animate-orb-pulse`} aria-hidden="true" />
                  {p.activity.text}
                </Link>
              )}
            </div>
          ))}

          {invites.map((i) => (
            <Link
              key={i.providerKey}
              href="/app/connections"
              className="group rounded-card p-5 shadow-hairline transition-colors duration-fast hover:bg-ink/[0.025]"
            >
              <div className="flex items-center gap-2.5">
                <ConnectorLogo kind="app" providerKey={i.providerKey} displayName={i.name} size={16} />
                <p className="text-[0.875rem] font-semibold">Connect {i.name}</p>
                <Plus size={13} strokeWidth={1.9} className="ml-auto text-ink-soft" aria-hidden="true" />
              </div>
              <p className="t-caption mt-3">Track {i.tracks} here.</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A live number counts to its value instead of hard-swapping. The value is
 * still the exact truth the provider reported — a capped total renders as
 * "100+", never as an exact number it isn't; only the arrival animates.
 */
function FactNumber({ value, atLeast }: { value: number; atLeast?: boolean }) {
  const shown = useCountUp(value, 500);
  return (
    <span className="font-display text-[1.125rem] tabular-nums">
      {shown.toLocaleString()}
      {atLeast ? "+" : ""}
    </span>
  );
}
