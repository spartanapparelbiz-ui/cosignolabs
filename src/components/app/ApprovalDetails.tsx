"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  ActionEventRecord,
  ActionPreview,
  ActionRecord,
} from "@/lib/types";
import { businessAction } from "@/lib/actionLibrary";
import { actionRisk, requiredApproval, willBullets } from "@/lib/risk";
import { operatorOf, extractDiff } from "@/lib/actionPresentation";
import { sourceIdentity } from "@/lib/clarity";

/**
 * The details panel — everything behind "view details", in the order a person
 * asks for it:
 *
 *   what AI wants · what will change · who requested it · affected systems ·
 *   estimated impact · approval history · audit log
 *
 * Each section is a plain sentence or a short list. The raw payload is at the
 * very bottom, collapsed, because it is the only part of this panel that is
 * for an engineer — and the panel exists so nobody else has to read it.
 *
 * Every line is derived from resolved state (category, tier, the connection,
 * the ledger's own events). Nothing here is model prose, so no section can
 * describe an effect the action doesn't have.
 */

interface Props {
  action: ActionRecord;
  preview?: ActionPreview;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The ledger's event types, said out loud. */
const EVENT_LABEL: Record<string, string> = {
  proposed: "AI asked to do this",
  edited: "you edited the values",
  approved: "you approved it",
  vetoed: "you rejected it",
  executing: "it started running",
  executed: "it finished",
  failed: "it failed",
  blocked: "policy blocked it",
  flagged: "held — outside content tried to direct it",
};

const ACTOR_LABEL: Record<string, string> = {
  user: "you",
  agent: "cosigno",
  system: "cosigno",
};

export function ApprovalDetails({ action, preview }: Props) {
  const [events, setEvents] = useState<ActionEventRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  // The history is the only part that needs a round trip, so it loads when the
  // panel opens rather than for every card in the queue.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/actions/${action.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("history unavailable"))))
      .then((d) => !cancelled && setEvents(d.events ?? []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [action.id]);

  const risk = actionRisk(action);
  const bullets = willBullets(action);
  const diff = extractDiff(action.payload);
  const where = sourceIdentity(action);
  const named = preview ? businessAction(preview.operation).name : null;

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-btn bg-cream-deep/50 px-4 py-3.5">
      <Section title="what AI wants">
        <p className="text-sm font-semibold">{action.summary}</p>
        {named && <p className="mt-0.5 text-xs text-ink-soft">{named}</p>}
      </Section>

      <Section title="what will change">
        {diff ? (
          <ul className="flex flex-col gap-1">
            {diff.map((row) => (
              <li key={row.field} className="text-xs">
                <span className="font-bold">{row.field}</span>{" "}
                <span className="text-ink-soft line-through decoration-ink/40">{row.before}</span>{" "}
                <span aria-hidden="true">→</span> <span className="font-bold">{row.after}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-1">
            {bullets.map((b) => (
              <li key={b} className="text-xs">
                {b}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="who requested it">
        <p className="text-xs">
          cosigno&apos;s {operatorOf(action.category)} operator, {when(action.created_at)}.
          {action.tier_note ? ` ${action.tier_note}` : ""}
        </p>
      </Section>

      <Section title="affected systems">
        <p className="text-xs">
          {where.name}
          {preview && !preview.unknown_connection ? ` · ${preview.resource.replace(/_/g, " ")}` : ""}.{" "}
          {where.doing}
        </p>
      </Section>

      <Section title="estimated impact">
        <p className="text-xs">
          <span className="font-bold">{risk.level} risk</span> — {risk.because} Needs{" "}
          {requiredApproval(action)}.
        </p>
        {preview && <p className="mt-1 text-xs text-ink-soft">{preview.undo}</p>}
      </Section>

      <Section title="approval history">
        {failed ? (
          <p className="text-xs text-ink-soft">
            The history couldn&apos;t be loaded just now — it is still on the ledger.
          </p>
        ) : events === null ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <Loader2 size={11} className="animate-spin" aria-hidden="true" /> loading…
          </p>
        ) : events.length === 0 ? (
          <p className="text-xs text-ink-soft">Nothing has happened to this yet beyond the request.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {events.map((e) => (
              <li key={e.id} className="text-xs">
                <span className="font-bold">{EVENT_LABEL[e.type] ?? e.type}</span>
                <span className="text-ink-soft">
                  {" "}
                  · {ACTOR_LABEL[e.actor] ?? e.actor} · {when(e.created_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="audit log">
        <p className="text-xs text-ink-soft">
          This action is permanently recorded, whatever you decide. Nothing on this panel can change
          what the ledger already holds.
        </p>
        <button
          onClick={() => setRawOpen((v) => !v)}
          aria-expanded={rawOpen}
          className="mt-1.5 text-xs font-bold lowercase text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {rawOpen ? "hide the exact values" : "show the exact values"}
        </button>
        {rawOpen && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-btn bg-cream px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink shadow-well">
            {JSON.stringify(action.payload, null, 2)}
          </pre>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-soft">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}
