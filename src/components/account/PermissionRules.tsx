"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Trash2, X } from "lucide-react";
import { describeRule, parsePermissionRule } from "@/lib/rules";
import type { PermissionRuleRecord, RuleRequirement } from "@/lib/types";

/**
 * Custom permission rules — write a standing policy in plain language ("never
 * refund more than $200 without my signature") and see it turn into a visible,
 * editable structured constraint. Rules only ever TIGHTEN what cosigno may do;
 * they never loosen a boundary. The live preview uses the SAME deterministic
 * parser the server does, so what you see is exactly what gets stored + enforced.
 */

const REQ_META: Record<RuleRequirement, { label: string; cls: string }> = {
  auto: { label: "auto", cls: "bg-cream-deep text-ink-soft" },
  approve: { label: "approve", cls: "ring-1 ring-inset ring-signal/50 text-signal" },
  sign: { label: "sign", cls: "bg-signal text-cream" },
  never: { label: "never", cls: "bg-ink text-cream" },
};

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

function RequirementBadge({ requirement }: { requirement: RuleRequirement }) {
  const m = REQ_META[requirement];
  return (
    <span className={`rounded-pill px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function PermissionRules() {
  const [rules, setRules] = useState<PermissionRuleRecord[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instant preview — identical logic to the server, no round-trip.
  const preview = useMemo(() => {
    const t = text.trim();
    if (t.length < 3) return null;
    const parsed = parsePermissionRule(t);
    return { parsed, description: describeRule(parsed) };
  }, [text]);

  async function load() {
    try {
      const d = await api("/api/rules");
      setRules(d.rules ?? []);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    const t = text.trim();
    if (t.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/rules", { method: "POST", body: JSON.stringify({ text: t }) });
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't add that rule.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: PermissionRuleRecord) {
    setRules((prev) => prev?.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)) ?? prev);
    try {
      await api(`/api/rules/${r.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !r.enabled }) });
    } catch {
      await load();
    }
  }

  async function remove(id: string) {
    setRules((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    try {
      await api(`/api/rules/${id}`, { method: "DELETE" });
    } catch {
      await load();
    }
  }

  if (unavailable) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="flex items-center gap-1.5 text-xs font-bold lowercase tracking-wide text-ink-soft">
          <ShieldCheck size={13} /> permission rules
        </h4>
        <p className="mt-1 text-[11px] text-ink-soft">
          your standing policy across every tool, in plain language — cosigno turns it
          into a visible rule. rules only ever <span className="font-bold">tighten</span> what
          cosigno may do (require approval or a signature, or forbid it), never loosen it.
        </p>
      </div>

      <div className="rounded-card bg-surface/60 p-3 shadow-soft">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder='e.g. "never refund more than $200 without my signature"'
          className="w-full resize-none rounded-btn bg-cream-deep px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        />
        {preview && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-btn bg-cream-deep/60 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">reads as</span>
            <RequirementBadge requirement={preview.parsed.requirement} />
            <span className="min-w-0 flex-1 text-[11px] text-ink-soft">{preview.description}</span>
            {preview.parsed.confidence === "low" && (
              <span className="rounded-pill bg-signal/15 px-2 py-0.5 text-[9px] font-bold uppercase text-signal">
                unclear — add a tool or action
              </span>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-[11px] font-semibold text-signal">{error}</p>}
        <button
          onClick={add}
          disabled={busy || text.trim().length < 3}
          className="mt-2 self-start rounded-btn bg-ink px-4 py-2 text-sm font-extrabold text-cream disabled:opacity-40"
        >
          {busy ? "adding…" : "add rule"}
        </button>
      </div>

      {rules && rules.length === 0 && (
        <p className="rounded-card bg-surface/40 px-4 py-4 text-xs text-ink-soft shadow-soft">
          no rules yet. add one above — cosigno reads every enabled rule before it acts,
          and enforces the strictest matching rule at the boundary.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {(rules ?? []).map((r) => (
          <div
            key={r.id}
            className={`rounded-card bg-surface/60 p-3 shadow-soft ${r.enabled ? "" : "opacity-55"}`}
          >
            <div className="flex items-start gap-2">
              <RequirementBadge requirement={r.requirement} />
              <p className="min-w-0 flex-1 text-sm font-semibold">{r.text}</p>
              <button
                onClick={() => toggle(r)}
                aria-pressed={r.enabled}
                className={`shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-bold lowercase ${
                  r.enabled ? "bg-signal text-cream" : "ring-1 ring-inset ring-ink text-ink"
                }`}
              >
                {r.enabled ? "on" : "off"}
              </button>
              <button
                onClick={() => remove(r.id)}
                className="shrink-0 rounded-btn p-1.5 text-ink-soft hover:bg-cream-deep hover:text-ink"
                aria-label="delete rule"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft">
              <Chip label={r.target === "any" ? "any tool" : r.target} />
              <Chip label={r.verb === "any" ? "any action" : r.verb} />
              {r.condition.kind === "amount" && (
                <Chip label={`amount ${r.condition.op} $${r.condition.value}`} />
              )}
              {r.condition.kind === "channel" && <Chip label={String(r.condition.match)} />}
              {r.condition.kind === "label" && <Chip label={`label "${r.condition.match}"`} />}
              {r.confidence === "low" && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-signal/15 px-2 py-0.5 font-bold text-signal">
                  <X size={9} /> low confidence
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-pill bg-cream-deep px-2 py-0.5 font-mono font-bold text-ink-soft">
      {label}
    </span>
  );
}
