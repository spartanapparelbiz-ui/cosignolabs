"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes, Lock } from "lucide-react";
import type { MapSystem, WorkspaceMap as MapData } from "@/lib/workspace-model/map";
import type { ActionSpec } from "@/lib/workspace-model/actionSpec";

/**
 * The Workspace Map — what AI works with, read left to right.
 *
 * One box per connected system, in the order work flows through them, with an
 * arrow only where two neighbours genuinely share a business object. Clicking
 * a box opens what's inside it: the objects it holds, the actions AI can take,
 * and what it shares with everything else.
 *
 * No zoom. No pan. No node graph. If a map needs a zoom control, it has stopped
 * being a map.
 */

const DOMAIN_WORD: Record<string, string> = {
  code: "code",
  storage: "files",
  productivity: "work",
  finance: "money",
  crm: "customers",
  comms: "messages",
  identity: "access",
  generic: "data",
};

const RISK_WORD: Record<string, string> = {
  read: "reads",
  write: "changes",
  destructive: "deletes",
};

export function WorkspaceMap() {
  const [map, setMap] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workspace-model/map", { cache: "no-store" });
        if (!res.ok) throw new Error("the map isn't available right now.");
        const data = await res.json();
        setMap(data.map);
        setOpenId(data.map?.systems?.[0]?.id ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "the map isn't available right now.");
      }
    })();
  }, []);

  const open = map?.systems.find((s) => s.id === openId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold lowercase tracking-tight">workspace map</h1>
        <p className="mt-2 max-w-2xl text-base font-semibold text-ink-soft">
          What AI works with, and how your systems connect. Every box is something real — click one
          to see what&apos;s inside it.
        </p>
      </header>

      {error && <p className="mt-8 rounded-card border border-line bg-surface p-5 text-sm font-semibold">{error}</p>}

      {!map && !error && (
        <div className="mt-10 h-32 animate-pulse rounded-card border border-line bg-surface" aria-hidden="true" />
      )}

      {map?.empty && (
        <div className="mt-10 rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
          <Boxes size={22} className="mx-auto text-ink-soft" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">Nothing connected yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Connect a tool and it appears here, with everything AI can do to it.
          </p>
          <Link
            href="/app/connections"
            className="mt-4 inline-flex rounded-btn bg-ink px-4 py-2 text-xs font-black uppercase tracking-wider text-cream"
          >
            add a connection
          </Link>
        </div>
      )}

      {map && !map.empty && (
        <>
          <div className="mt-10 overflow-x-auto pb-2">
            <ol className="flex min-w-min items-stretch gap-1">
              {map.systems.map((system, i) => {
                const linked = map.links.some((l) => l.from === system.id);
                return (
                  <li key={system.id} className="flex items-center gap-1">
                    <SystemBox
                      system={system}
                      active={system.id === openId}
                      onClick={() => setOpenId(system.id === openId ? null : system.id)}
                    />
                    {i < map.systems.length - 1 && (
                      <ArrowRight
                        size={16}
                        className={linked ? "shrink-0 text-ink" : "shrink-0 text-line"}
                        aria-hidden="true"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="mt-1 text-[11px] text-ink-soft">
            A solid arrow means the two systems hold the same business objects. A faint one means
            they sit next to each other in the flow but share nothing.
          </p>

          {open && <SystemDetail system={open} />}
        </>
      )}

      <p className="mt-10 text-center text-[11px] leading-relaxed text-ink-soft">
        The map shows structure — what exists and what AI may do to it. It isn&apos;t a copy of your
        data: an object says &ldquo;not synced&rdquo; unless cosigno has genuinely observed it.
      </p>
    </div>
  );
}

function SystemBox({
  system,
  active,
  onClick,
}: {
  system: MapSystem;
  active: boolean;
  onClick: () => void;
}) {
  const offline = system.status !== "connected";
  return (
    <button
      onClick={onClick}
      aria-expanded={active}
      className={`flex h-full w-[148px] shrink-0 flex-col justify-between rounded-card border px-3.5 py-3 text-left transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
        active
          ? "border-ink bg-surface shadow-lift"
          : "border-line bg-surface/70 shadow-soft hover:border-ink/40"
      }`}
    >
      <span className="block text-sm font-bold leading-snug">{system.name}</span>
      <span className="mt-2 block text-[11px] text-ink-soft">
        {DOMAIN_WORD[system.domain] ?? "data"} · {system.objects.length} object
        {system.objects.length === 1 ? "" : "s"}
      </span>
      {offline && (
        <span className="mt-1.5 inline-flex w-fit rounded-pill bg-cream-deep px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink-soft">
          {system.status.replace(/_/g, " ")}
        </span>
      )}
    </button>
  );
}

function SystemDetail({ system }: { system: MapSystem }) {
  const [openAction, setOpenAction] = useState<string | null>(null);
  const reads = system.actions.filter((a) => a.risk === "read");
  const writes = system.actions.filter((a) => a.risk === "write");
  const destructive = system.actions.filter((a) => a.risk === "destructive");
  const specOf = (id: string) => system.specs?.find((s) => s.id === id) ?? null;

  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-soft">
      <h2 className="font-display text-xl font-bold">{system.name}</h2>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        {system.shares_with.length > 0
          ? `Shares objects with ${system.shares_with.join(", ")}.`
          : "Doesn't share objects with anything else you've connected."}
      </p>
      {system.coverage && (
        <p className="mt-1 text-xs text-ink-soft">{system.coverage.summary}</p>
      )}

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-soft">
            what it holds
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {system.objects.map((o) => (
              <li key={o.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{o.label}</span>
                <span className="shrink-0 text-[11px] text-ink-soft">
                  {o.synced_count === null ? "not synced" : `${o.synced_count.toLocaleString()} synced`}
                </span>
              </li>
            ))}
            {system.objects.length === 0 && (
              <li className="text-sm text-ink-soft">Nothing modelled yet.</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-soft">
            what AI can do here
          </h3>
          <div className="mt-2 flex flex-col gap-3">
            {[
              ["reads", reads],
              ["changes", writes],
              ["deletes", destructive],
            ].map(([word, list]) => {
              const actions = list as typeof reads;
              if (actions.length === 0) return null;
              return (
                <div key={word as string}>
                  <p className="text-[11px] font-bold text-ink-soft">{RISK_WORD[word as string] ?? word}</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {actions.map((a) => {
                      const open = openAction === a.id;
                      return (
                        <li key={a.id}>
                          <button
                            onClick={() => setOpenAction(open ? null : a.id)}
                            aria-expanded={open}
                            className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
                              a.risk === "destructive"
                                ? "bg-ink text-cream"
                                : a.risk === "write"
                                  ? "bg-signal/20 text-ink"
                                  : "bg-cream-deep text-ink-soft"
                            } ${open ? "ring-2 ring-signal" : ""}`}
                          >
                            {!a.reversible && <Lock size={9} strokeWidth={2.6} aria-hidden="true" />}
                            {a.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {system.actions.length === 0 && (
              <p className="text-sm text-ink-soft">This connection hasn&apos;t advertised anything yet.</p>
            )}
          </div>
        </div>
      </div>

      {openAction && <ActionDetail spec={specOf(openAction)} />}
    </section>
  );
}

/**
 * One action, in the universal shape — the same nine answers whichever kind of
 * system it came from. Every line is derived from what the connector actually
 * declared, so "not declared" is a real answer rather than a blank.
 */
function ActionDetail({ spec }: { spec: ActionSpec | null }) {
  if (!spec) {
    return (
      <p className="mt-5 rounded-btn bg-cream-deep/60 px-4 py-3 text-sm text-ink-soft">
        cosigno hasn&apos;t modelled this action in detail yet.
      </p>
    );
  }

  return (
    <div className="mt-5 rounded-card border border-line bg-cream/40 p-4">
      <p className="text-base font-bold">{spec.name}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{spec.description}</p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Fact label="needs">
          {spec.inputs_declared ? (
            spec.inputs.length === 0 ? (
              <span>nothing</span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {spec.inputs.map((i) => (
                  <li key={i.name}>
                    {i.label}
                    {i.required ? "" : " (optional)"}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <span className="text-ink-soft">
              This connector didn&apos;t declare its inputs, so cosigno can&apos;t list them.
            </span>
          )}
        </Fact>
        <Fact label="produces">{spec.expected_result}</Fact>
        <Fact label="risk">
          {spec.risk} — {spec.risk_because}
        </Fact>
        <Fact label="approval">{spec.approval}</Fact>
        <Fact label="permission">{spec.permissions.join(", ")}</Fact>
        <Fact label="done means">{spec.success_criteria}</Fact>
        <Fact label="verified by">{spec.verification.how}</Fact>
        <Fact label="undo">{spec.rollback.how}</Fact>
      </dl>

      <div className="mt-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-soft">before it runs</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {spec.validation.map((rule) => (
            <li key={rule} className="text-xs text-ink-soft">
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-xs font-semibold">{children}</dd>
    </div>
  );
}
