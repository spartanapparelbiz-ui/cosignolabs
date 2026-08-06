"use client";

import { useEffect, useState } from "react";
import { Boxes, ChevronDown, Lock } from "lucide-react";

/**
 * Capabilities — the capability model of every connected application. The
 * route and the API still say "twin"; only the words a person reads changed.
 *
 * Shows what each app actually exposes: resource types, the operations on each,
 * and the authority each operation requires. Reuses the existing dashboard
 * vocabulary; no new design language.
 */

interface Operation {
  id: string;
  mutation: "read" | "create" | "update" | "delete";
  summary: string;
  mutates: boolean;
  category: string;
  tier: number;
  reversible: boolean;
}
interface Resource {
  name: string;
  label: string;
  operations: Operation[];
  synced_count: number | null;
}
interface Twin {
  connection_key: string;
  name: string;
  kind: "app" | "mcp";
  status: string;
  source: string;
  resources: Resource[];
  operation_count: number;
  schema_only: boolean;
}

const MUTATION_TONE: Record<Operation["mutation"], string> = {
  read: "bg-cream-deep text-ink-soft",
  create: "bg-signal/15 text-ink",
  update: "bg-signal/15 text-ink",
  delete: "bg-ink text-cream",
};

const TIER_LABEL: Record<number, string> = { 1: "auto", 2: "approve", 3: "sign" };

export function DigitalTwins() {
  const [twins, setTwins] = useState<Twin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/twin?available=1", { cache: "no-store" });
        if (!res.ok) throw new Error(`capabilities unavailable (${res.status})`);
        const data = await res.json();
        setTwins(data.twins ?? []);
        setOpen(data.twins?.[0]?.connection_key ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "couldn't load capabilities.");
      }
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        {/* "capabilities" is the word the nav uses. A twin is a thing nobody
            can guess from the label, so the page says what it shows instead. */}
        <p className="text-xs font-black uppercase tracking-[0.28em] text-signal">capabilities</p>
        <h1 className="mt-2 font-display text-3xl font-bold lowercase tracking-tight sm:text-4xl">
          cosigno models your tools before it touches them.
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-soft">
          every connected app has a capability model: its resource types, the operations on
          each, and the authority each one requires. the planner reasons over this model — an
          operation that isn&apos;t in it can&apos;t be planned, so a made-up API call never
          reaches the network.
        </p>
      </header>

      {error && (
        <p className="mt-6 rounded-card border border-line bg-surface p-4 text-sm font-semibold">
          {error}
        </p>
      )}

      {!twins && !error ? (
        <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      ) : twins && twins.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
          <Boxes size={22} className="mx-auto text-ink-soft" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold">nothing modelled yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            connect a tool and its capability model is built automatically from the
            operations it exposes.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {twins?.map((t) => {
            const expanded = open === t.connection_key;
            return (
              <div
                key={t.connection_key}
                className="overflow-hidden rounded-card border border-line bg-surface shadow-soft"
              >
                <button
                  onClick={() => setOpen(expanded ? null : t.connection_key)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors duration-fast hover:bg-cream-deep/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold">
                      {t.name}
                      <span className="rounded-pill bg-cream-deep px-2 py-0.5 font-mono text-[10px] font-bold text-ink-soft">
                        {t.kind}
                      </span>
                      {t.status !== "connected" && (
                        <span className="rounded-pill px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink-soft ring-1 ring-inset ring-line">
                          {t.status.replace(/_/g, " ")}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {t.resources.length} resource type{t.resources.length === 1 ? "" : "s"} ·{" "}
                      {t.operation_count} operation{t.operation_count === 1 ? "" : "s"}
                      {t.schema_only && " · capability model (no record data synced)"}
                    </p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-ink-soft transition-transform duration-fast ${expanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>

                {expanded && (
                  <div className="border-t border-line px-4 py-4">
                    {t.resources.length === 0 ? (
                      <p className="text-sm text-ink-soft">
                        this connection hasn&apos;t advertised any operations yet.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {t.resources.map((r) => (
                          <div key={r.name}>
                            <p className="flex items-baseline gap-2 text-sm font-bold">
                              {r.label}
                              <span className="text-[11px] font-semibold text-ink-soft">
                                {r.synced_count === null
                                  ? "not synced"
                                  : `${r.synced_count.toLocaleString()} synced`}
                              </span>
                            </p>
                            <ul className="mt-2 flex flex-col gap-1.5">
                              {r.operations.map((o) => (
                                <li
                                  key={o.id}
                                  className="flex flex-wrap items-center gap-2 rounded-btn border border-line/70 bg-cream/40 px-3 py-2"
                                >
                                  <span
                                    className={`rounded-pill px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${MUTATION_TONE[o.mutation]}`}
                                  >
                                    {o.mutation}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm">
                                    {o.summary}
                                  </span>
                                  {!o.reversible && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-soft">
                                      <Lock size={10} aria-hidden="true" /> irreversible
                                    </span>
                                  )}
                                  <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink-soft">
                                    {TIER_LABEL[o.tier] ?? "approve"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-center text-[11px] leading-relaxed text-ink-soft">
        this models an app&apos;s capability surface, not its records. resources show
        &ldquo;not synced&rdquo; unless instances have actually been observed — cosigno never
        claims to hold data it hasn&apos;t fetched.
      </p>
    </div>
  );
}
