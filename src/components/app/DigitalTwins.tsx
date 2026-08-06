"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Boxes, ChevronDown, Lock } from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";

/**
 * "What cosigno can do" — per app, in the four verbs a person already knows:
 * read, create, update, delete.
 *
 * Every capability listed is one the integration genuinely exposes (this is
 * the same model the planner is constrained by — an operation absent here
 * cannot even be planned). The page just stops asking the reader to learn
 * the modeling vocabulary: no "resource types", no "operations", no
 * "capability model". A connected app shows what cosigno has actually done
 * with it lately; a disconnected one shows exactly what connecting unlocks.
 */

interface Operation {
  id: string;
  mutation: "read" | "create" | "update" | "delete";
  summary: string;
  tier: number;
  reversible: boolean;
}
interface Resource {
  name: string;
  label: string;
  operations: Operation[];
}
interface Twin {
  connection_key: string;
  name: string;
  kind: "app" | "mcp";
  status: string;
  resources: Resource[];
  operation_count: number;
  last_checked_at?: string | null;
}

interface RecentAction {
  id: string;
  summary: string;
  status: string;
  created_at: string;
}

const GROUPS: { mutation: Operation["mutation"]; title: string }[] = [
  { mutation: "read", title: "Read" },
  { mutation: "create", title: "Create" },
  { mutation: "update", title: "Update" },
  { mutation: "delete", title: "Delete" },
];

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DigitalTwins() {
  const [twins, setTwins] = useState<Twin[] | null>(null);
  const [recent, setRecent] = useState<RecentAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/twin?available=1", { cache: "no-store" });
        if (!res.ok) throw new Error("couldn't load your apps right now.");
        const data = await res.json();
        setTwins(data.twins ?? []);
        setOpen(
          (data.twins ?? []).find((t: Twin) => t.status === "connected")?.connection_key ??
            data.twins?.[0]?.connection_key ??
            null
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "couldn't load your apps right now.");
      }
    })();
    // Recent work per app comes from the real action ledger — EXECUTED
    // connector actions only (a proposed card hasn't done anything yet), whose
    // summaries begin with the app's display name.
    fetch("/api/activity?category=connection_call&status=executed&limit=1000")
      .then((r) => r.json())
      .then((d) => setRecent(Array.isArray(d.actions) ? d.actions : []))
      .catch(() => undefined);
  }, []);

  const connected = (twins ?? []).filter((t) => t.status === "connected");
  const available = (twins ?? []).filter((t) => t.status !== "connected");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 lg:px-10">
      <header>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          What cosigno can do in your apps
        </h1>
        <p className="mt-2 max-w-2xl text-base text-ink-soft">
          Every ability listed is real — if it isn&apos;t listed here, cosigno can&apos;t do it.
          Anything beyond reading waits for your approval.
        </p>
        {recent.length > 0 && (
          <p className="mt-3 inline-flex items-center rounded-pill bg-surface/70 px-3.5 py-1.5 text-xs font-bold shadow-soft">
            {recent.length.toLocaleString()}
            {recent.length >= 1000 ? "+" : ""} completed action
            {recent.length === 1 ? "" : "s"} across your connected apps
          </p>
        )}
      </header>

      {error && (
        <p className="mt-6 rounded-card bg-surface/70 p-4 text-sm font-semibold shadow-soft">
          {error}
        </p>
      )}

      {!twins && !error ? (
        <div className="mt-8 flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-card bg-cream-deep" />
          ))}
        </div>
      ) : twins && twins.length === 0 ? (
        <div className="mt-8 rounded-card bg-surface/60 p-12 text-center shadow-soft">
          <Boxes size={22} className="mx-auto text-ink-soft" aria-hidden="true" />
          <p className="mt-3 text-base font-extrabold">No apps yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            Connect an app and this page shows exactly what cosigno can — and cannot — do
            inside it.
          </p>
          <Link
            href="/app/connections"
            className="mt-5 inline-block rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold lowercase text-cream transition-transform duration-fast hover:-translate-y-px"
          >
            connect an app
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {connected.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
                Connected
              </h2>
              {connected.map((t) => (
                <TwinCard
                  key={t.connection_key}
                  twin={t}
                  recent={recent.filter((a) => a.summary.startsWith(`${t.name}:`)).slice(0, 3)}
                  expanded={open === t.connection_key}
                  onToggle={() =>
                    setOpen(open === t.connection_key ? null : t.connection_key)
                  }
                />
              ))}
            </section>
          )}
          {available.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
                Not connected yet
              </h2>
              {available.map((t) => (
                <TwinCard
                  key={t.connection_key}
                  twin={t}
                  recent={[]}
                  expanded={open === t.connection_key}
                  onToggle={() =>
                    setOpen(open === t.connection_key ? null : t.connection_key)
                  }
                />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TwinCard({
  twin: t,
  recent,
  expanded,
  onToggle,
}: {
  twin: Twin;
  recent: RecentAction[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const isConnected = t.status === "connected";
  const allOps = useMemo(() => t.resources.flatMap((r) => r.operations), [t.resources]);
  const needsApproval = allOps.filter((o) => o.tier > 1).length;

  return (
    <div className="overflow-hidden rounded-card bg-surface/70 shadow-soft transition-shadow duration-base hover:shadow-lift">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-fast hover:bg-cream-deep/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <ConnectorLogo kind={t.kind} providerKey={t.connection_key} displayName={t.name} size={30} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-base font-extrabold">
            {t.name}
            {isConnected ? (
              <span className="rounded-pill bg-signal/15 px-2 py-0.5 text-[10px] font-extrabold lowercase text-ink ring-1 ring-inset ring-signal/40">
                connected
              </span>
            ) : (
              <span className="rounded-pill px-2 py-0.5 text-[10px] font-bold lowercase text-ink-soft ring-1 ring-inset ring-line">
                {t.status === "not_connected" ? "not connected" : t.status.replace(/_/g, " ")}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {t.operation_count} thing{t.operation_count === 1 ? "" : "s"} cosigno can do
            {needsApproval > 0 && ` · ${needsApproval} need${needsApproval === 1 ? "s" : ""} your approval`}
            {isConnected && t.last_checked_at && ` · last checked ${ago(t.last_checked_at)}`}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-soft transition-transform duration-fast ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="border-t border-line/60 px-5 py-5 animate-fade-through">
          {!isConnected && (
            <p className="mb-4 rounded-btn bg-cream-deep px-4 py-3 text-sm">
              <span className="font-bold">connecting unlocks all of this — </span>
              cosigno can start doing every ability below the moment you connect, with anything
              beyond reading still waiting for your approval.{" "}
              <Link
                href="/app/connections"
                className="font-bold underline decoration-signal underline-offset-2"
              >
                connect {t.name}
              </Link>
            </p>
          )}

          {allOps.length === 0 ? (
            <p className="text-sm text-ink-soft">
              this connection hasn&apos;t told cosigno what it can do yet.
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {GROUPS.map((g) => {
                const ops = allOps.filter((o) => o.mutation === g.mutation);
                if (ops.length === 0) return null;
                return (
                  <div key={g.mutation}>
                    <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-soft">
                      {g.title}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {ops.map((o) => (
                        <li key={o.id} className="flex items-start gap-2 text-sm">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-signal/60"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            {o.summary}
                            {o.tier > 1 && (
                              <span className="ml-1.5 whitespace-nowrap rounded-pill bg-signal/15 px-1.5 py-px text-[10px] font-extrabold lowercase text-ink">
                                asks you first
                              </span>
                            )}
                            {!o.reversible && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-bold text-ink-soft">
                                <Lock size={9} aria-hidden="true" /> can&apos;t be undone
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {isConnected && (
            <div className="mt-5 border-t border-line/60 pt-4">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-soft">
                Recently, in {t.name}
              </h3>
              {recent.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">
                  nothing yet — when cosigno works in {t.name}, what it did shows up here.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {recent.map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {a.summary.slice(t.name.length + 1).trim()}
                      </span>
                      <span className="shrink-0 text-xs text-ink-soft">{ago(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
