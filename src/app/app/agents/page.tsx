import Link from "next/link";
import { Bot } from "lucide-react";
import { requireUser } from "@/lib/api";
import { isProduction } from "@/lib/env";
import { listDecisions } from "@/lib/authz/store";
import { buildRoster, type AgentSummary } from "@/lib/agents";
import type { RiskLevel } from "@/lib/risk";

/**
 * Agents — "which AI assistants are connected?"
 *
 * The roster is derived from the decision ledger: an assistant appears here
 * because it actually presented a key and asked cosigno for authority. Nothing
 * is listed that has never asked for anything, because a connection nobody
 * made is not a connection.
 *
 * Read-only, like every ledger view — there is no control on this page that
 * can alter what an agent already did.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Agents" };

const RISK_STYLE: Record<RiskLevel, string> = {
  low: "bg-cream-deep text-ink-soft",
  medium: "bg-cream-deep text-ink ring-1 ring-inset ring-ink/15",
  high: "bg-signal/20 text-ink ring-1 ring-inset ring-signal/50",
  critical: "bg-ink text-cream",
};

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

export default async function AgentsPage() {
  const userId = await requireUser();
  const org = isProduction() ? `org_${userId}` : "org_demo";
  const roster = buildRoster(listDecisions(org, 500));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold lowercase tracking-tight">agents</h1>
        <p className="mt-2 text-base font-semibold text-ink-soft">
          Which AI assistants are connected, and what each one has asked to do.
        </p>
      </header>

      {roster.agents.length === 0 ? (
        <div className="mt-10 rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
          <Bot size={24} className="mx-auto text-ink-soft" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">No AI assistant has asked for anything yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            An assistant appears here the first time it asks cosigno for permission. Until one does,
            there is nothing to show — and cosigno won&apos;t pretend otherwise.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-3 gap-2">
            {[
              ["requests", roster.total_requests],
              ["waiting on you", roster.awaiting_people],
              ["blocked", roster.blocked],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-card border border-line bg-surface px-4 py-3 shadow-soft">
                <dt className="text-[10px] font-black uppercase tracking-wider text-ink-soft">{label}</dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <ul className="mt-6 flex flex-col gap-2">
            {roster.agents.map((agent) => (
              <AgentRow key={agent.actor} agent={agent} />
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 text-xs leading-relaxed text-ink-soft">
        Assistants connect by presenting a key and calling cosigno before they act — every request
        they make lands on your{" "}
        <Link href="/app/activity" className="font-bold underline decoration-line underline-offset-2 hover:text-ink">
          activity log
        </Link>
        , whether it cleared automatically or waited for you.
      </p>
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentSummary }) {
  return (
    <li className="rounded-card border border-line bg-surface px-5 py-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-bold">
            <Bot size={15} strokeWidth={2.4} aria-hidden="true" />
            {agent.actor}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-soft">{agent.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-pill px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${RISK_STYLE[agent.peak_risk]}`}
          >
            {agent.peak_risk} risk
          </span>
          <span className="text-xs text-ink-soft">{ago(agent.last_seen)}</span>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {agent.actions.slice(0, 6).map((a) => (
          <li
            key={a.id}
            className="rounded-pill bg-cream-deep px-2.5 py-1 text-[11px] font-bold text-ink-soft"
          >
            {a.label}
          </li>
        ))}
        {agent.actions.length > 6 && (
          <li className="px-1 py-1 text-[11px] text-ink-soft">+{agent.actions.length - 6} more</li>
        )}
      </ul>
    </li>
  );
}
