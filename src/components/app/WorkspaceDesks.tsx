"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { Desk, DeskState } from "@/lib/workspaceDesks";

/**
 * The glass wall — one desk per app, and what's happening at each.
 *
 * The room breathes even when nothing is moving: idle desks carry a slow,
 * quiet pulse, working desks a live one, and every "4 minutes ago" re-ticks on
 * its own so the page is never a photograph. That's atmosphere.
 *
 * The WORDS never join in. A quiet desk says "nothing right now"; a broken one
 * says it needs reconnecting. Ambient motion under an honest sentence is
 * warmth — ambient motion under an invented sentence is a lie with a heartbeat.
 */

const LIGHT: Record<DeskState, string> = {
  working: "bg-signal animate-orb-pulse",
  waiting: "bg-ink",
  attention: "bg-transparent ring-2 ring-inset ring-ink",
  // Alive, but calm — a desk with nobody at it, not a dead pixel.
  idle: "bg-cream-deep ring-1 ring-inset ring-ink/20 animate-orb-breathe",
};

const STATE_WORD: Record<DeskState, string> = {
  working: "working",
  waiting: "waiting",
  attention: "needs you",
  idle: "quiet",
};

function ago(iso: string | null, tick: number): string {
  if (!iso) return "no work yet";
  void tick; // re-computed on every tick so the room keeps its own time
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function WorkspaceDesks({ desks, summary }: { desks: Desk[]; summary: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // The clock keeps moving even when the data doesn't. A room where "2m ago"
  // is still "2m ago" ten minutes later is a photograph of a room.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (desks.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface/60 p-6 text-center">
        <p className="text-sm font-bold">No apps connected yet</p>
        <Link
          href="/app/connections"
          className="mt-2 inline-flex text-xs font-bold underline decoration-line underline-offset-2"
        >
          connect the first one
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold text-ink-soft">{summary}</p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {desks.map((desk) => {
          const isOpen = open === desk.key;
          return (
            <li
              key={desk.key}
              className={`overflow-hidden rounded-card border bg-surface transition-all duration-base ease-brand-out ${
                desk.state === "working" ? "border-signal/50 shadow-lift" : "border-line shadow-soft"
              }`}
            >
              <button
                onClick={() => setOpen(isOpen ? null : desk.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-cream-deep/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-pill ${LIGHT[desk.state]}`} aria-hidden="true" />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-bold">{desk.name}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                      {STATE_WORD[desk.state]}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
                    {desk.state === "attention" && (
                      <AlertTriangle size={11} strokeWidth={2.6} aria-hidden="true" />
                    )}
                    {desk.worker ? `${desk.worker} · ${desk.now}` : desk.now}
                  </span>
                </span>

                <span className="shrink-0 text-right text-[11px] text-ink-soft">
                  {ago(desk.last_activity_at, tick)}
                  {desk.pending_approvals > 0 && (
                    <span className="mt-0.5 block font-bold text-ink">
                      {desk.pending_approvals} to approve
                    </span>
                  )}
                </span>

                <ChevronRight
                  size={14}
                  className={`shrink-0 text-ink-soft transition-transform duration-fast ${isOpen ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <div className="animate-card-in border-t border-line/60 px-4 py-3">
                  {desk.pending_approvals > 0 && (
                    <Link
                      href="/app/approvals"
                      className="mb-2 inline-flex rounded-btn bg-signal px-3 py-1.5 text-xs font-extrabold text-ink"
                    >
                      Review {desk.pending_approvals} approval{desk.pending_approvals === 1 ? "" : "s"}
                    </Link>
                  )}

                  {desk.recent.length > 0 ? (
                    <>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-soft">
                        recently here
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {desk.recent.map((item) => (
                          <li key={item.text} className="text-xs">
                            {item.href ? (
                              <Link href={item.href} className="hover:text-ink hover:underline underline-offset-2">
                                {item.text}
                              </Link>
                            ) : (
                              item.text
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-ink-soft">Nothing has happened here yet.</p>
                  )}

                  <Link
                    href="/app/connections"
                    className="mt-2 inline-flex text-[11px] font-bold text-ink-soft underline decoration-line underline-offset-2 hover:text-ink"
                  >
                    {desk.state === "attention" ? "reconnect this app" : "app settings"}
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
