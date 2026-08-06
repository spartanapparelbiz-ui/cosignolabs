import { listDecisions } from "@/lib/authz/store";
import { ACTION_TYPES } from "@/lib/authz/registry";
import { CATEGORIES } from "@/lib/types";
import { requireUser } from "@/lib/api";
import { isProduction } from "@/lib/env";

/**
 * The authorization console — the operator's view of the layer.
 *
 * Reads the append-only decision ledger. There is deliberately no control on
 * this page that can alter a past decision: it is a record, not a workspace.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "authorization" };

const AUTHORITY_STYLE: Record<string, string> = {
  auto: "bg-cream-deep text-ink-soft",
  approve: "bg-signal/15 text-ink ring-1 ring-inset ring-signal/40",
  sign: "bg-signal text-ink",
  deny: "bg-ink text-cream",
};

const LEVEL_BAR: Record<string, { w: string; cls: string }> = {
  minimal: { w: "8%", cls: "bg-ink-soft/30" },
  low: { w: "28%", cls: "bg-ink-soft/50" },
  moderate: { w: "52%", cls: "bg-signal/60" },
  high: { w: "76%", cls: "bg-signal" },
  severe: { w: "100%", cls: "bg-ink" },
};

export default async function AuthorizeConsole() {
  const userId = await requireUser();
  const org = isProduction() ? `org_${userId}` : "org_demo";
  const decisions = listDecisions(org, 25);

  const total = decisions.length;
  const autoCleared = decisions.filter((d) => d.status === "approved").length;
  const heldForHuman = decisions.filter((d) => d.status === "pending").length;
  const denied = decisions.filter((d) => d.status === "denied").length;
  const executed = decisions.filter((d) => d.executed_at).length;
  const autoRate = total ? Math.round((autoCleared / total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-signal">
          authorization layer
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold lowercase tracking-tight sm:text-4xl">
          every AI action, decided and on the record.
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-soft">
          Agents call <code className="rounded bg-cream-deep px-1.5 py-0.5 font-mono text-xs">POST /api/v1/authorize</code>.
          Policy decides. Low-risk actions clear automatically; consequential ones wait for a
          human. Every decision below is permanent.
        </p>
      </header>

      {/* metrics */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "decisions", value: total, note: "on the ledger" },
          { label: "auto-cleared", value: `${autoRate}%`, note: `${autoCleared} of ${total}` },
          { label: "held for a human", value: heldForHuman, note: "policy required it" },
          { label: "tokens spent", value: executed, note: "verified at the boundary" },
        ].map((m) => (
          <div key={m.label} className="rounded-card border border-line bg-surface p-4 shadow-soft">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-soft">
              {m.label}
            </p>
            <p className="mt-1.5 font-display text-3xl font-bold tabular-nums">{m.value}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{m.note}</p>
          </div>
        ))}
      </div>

      {/* ledger */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold lowercase">the ledger</h2>
          <span className="text-xs font-semibold text-ink-soft">append-only · never editable</span>
        </div>

        {total === 0 ? (
          <p className="mt-4 rounded-card border border-line bg-surface p-6 text-sm text-ink-soft">
            No decisions yet. Send one with{" "}
            <code className="font-mono text-xs">POST /api/v1/authorize</code>.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black uppercase tracking-[0.14em] text-ink-soft">
                  <th className="px-3">actor / action</th>
                  <th className="px-3">blast radius</th>
                  <th className="px-3">authority</th>
                  <th className="px-3">decided because</th>
                  <th className="px-3 text-right">state</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => {
                  const bar = LEVEL_BAR[d.blast_level] ?? LEVEL_BAR.minimal;
                  const why = d.policy_trace.find((s) => s.effect === d.authority) ?? d.policy_trace[0];
                  return (
                    <tr key={d.id} className="bg-surface shadow-soft">
                      <td className="rounded-l-card border-y border-l border-line px-3 py-3">
                        <p className="font-mono text-xs text-ink-soft">{d.actor}</p>
                        <p className="font-bold">{d.action}</p>
                        <p className="font-mono text-[11px] text-ink-soft">{d.resource}</p>
                      </td>
                      <td className="border-y border-line px-3 py-3">
                        <div className="h-1.5 w-28 overflow-hidden rounded-pill bg-cream-deep">
                          <div className={`h-full ${bar.cls}`} style={{ width: bar.w }} />
                        </div>
                        <p className="mt-1 text-xs font-bold lowercase">{d.blast_level}</p>
                      </td>
                      <td className="border-y border-line px-3 py-3">
                        <span
                          className={`inline-flex rounded-pill px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${
                            AUTHORITY_STYLE[d.authority] ?? ""
                          }`}
                        >
                          {d.authority}
                        </span>
                        <p className="mt-1 text-[11px] text-ink-soft">tier {d.tier}</p>
                      </td>
                      <td className="max-w-sm border-y border-line px-3 py-3">
                        <p className="text-xs leading-relaxed text-ink-soft">
                          <span className="font-mono text-[11px] font-bold text-ink">{why?.rule}</span>
                          {" — "}
                          {why?.detail}
                        </p>
                      </td>
                      <td className="rounded-r-card border-y border-r border-line px-3 py-3 text-right">
                        {d.executed_at ? (
                          <span className="text-xs font-bold text-signal">executed</span>
                        ) : d.status === "approved" ? (
                          <span className="text-xs font-bold text-ink-soft">token issued</span>
                        ) : d.status === "denied" ? (
                          <span className="text-xs font-bold text-ink">denied</span>
                        ) : (
                          <span className="text-xs font-bold text-ink">awaiting signature</span>
                        )}
                        <p className="font-mono text-[10px] text-ink-soft">{d.id}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* registry */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold lowercase">action registry</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Every action type maps to a server-assigned floor. Unregistered actions never
          auto-clear.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTION_TYPES.map((t) => {
            const meta = CATEGORIES[t.category];
            return (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-btn border border-line bg-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-bold">{t.id}</p>
                  <p className="truncate text-[11px] text-ink-soft">{t.label}</p>
                </div>
                <span
                  className={`ml-2 shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-black ${
                    meta?.pinned ? "bg-ink text-cream" : "bg-cream-deep text-ink-soft"
                  }`}
                >
                  {meta?.pinned ? "PINNED T3" : `T${meta?.defaultTier ?? 2}`}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
