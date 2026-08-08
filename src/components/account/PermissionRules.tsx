"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { describeRule, parsePermissionRule } from "@/lib/rules";
import type { PermissionRuleRecord, RuleRequirement } from "@/lib/types";
import { badge, btn, dot, field, type BadgeTone } from "@/components/ui/styles";

/**
 * Custom permission rules — write a standing policy in plain language ("never
 * refund more than $200 without my signature") and see it turn into a visible,
 * editable structured constraint. Rules only ever TIGHTEN what cosigno may do;
 * they never loosen a boundary. The live preview uses the SAME deterministic
 * parser the server does, so what you see is exactly what gets stored + enforced.
 */

const REQ_META: Record<RuleRequirement, { label: string; tone: BadgeTone }> = {
  auto: { label: "auto", tone: "neutral" },
  approve: { label: "approve", tone: "signal" },
  sign: { label: "sign", tone: "signal" },
  never: { label: "never", tone: "danger" },
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
    <span className={badge(m.tone)}>
      <span className={dot(m.tone)} aria-hidden="true" />
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
    <section className="flex flex-col gap-5">
      <div>
        <p className="t-body max-w-[42rem]">
          Write a standing limit in plain language and cosigno turns it into a visible
          rule. A rule can only ever tighten what cosigno may do — never loosen it.
        </p>
        {/* Writing a rule straight into the box is fine, but the safer path is
            to see what it would have done first. Offer it right here. */}
        <Link
          href="/app/settings/rules"
          className="group mt-2 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-soft transition-colors duration-fast hover:text-ink"
        >
          Test a rule against your past work
          <ArrowRight
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="transition-transform duration-base ease-brand-out group-hover:translate-x-0.5"
          />
        </Link>
      </div>

      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder='e.g. "never refund more than $200 without my signature"'
          className={`${field("md")} resize-none`}
        />
        {preview && (
          <div className="mt-2.5 flex animate-fade-through flex-wrap items-center gap-2">
            <span className="t-eyebrow">Reads as</span>
            <RequirementBadge requirement={preview.parsed.requirement} />
            <span className="t-caption min-w-0 flex-1">{preview.description}</span>
            {preview.parsed.confidence === "low" && (
              <span className={badge("signal")}>name a tool or action</span>
            )}
          </div>
        )}
        {error && (
          <p className="t-body mt-2.5 border-l-2 border-danger pl-3.5 text-danger">{error}</p>
        )}
        <button
          onClick={add}
          disabled={busy || text.trim().length < 3}
          className={btn("secondary", "md", "mt-3")}
        >
          {busy ? "Adding…" : "Add rule"}
        </button>
      </div>

      {rules && rules.length === 0 && (
        <p className="t-caption">
          No rules yet. cosigno reads every enabled rule before it acts, and enforces the
          strictest one that matches.
        </p>
      )}

      <div className="-mx-3 flex flex-col">
        {(rules ?? []).map((r) => (
          <div
            key={r.id}
            className={`rounded-btn px-3 py-3 transition-colors duration-fast hover:bg-ink/[0.03] ${
              r.enabled ? "" : "opacity-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <RequirementBadge requirement={r.requirement} />
              <p className="min-w-0 flex-1 text-[0.9375rem]">{r.text}</p>
              <button
                onClick={() => toggle(r)}
                aria-pressed={r.enabled}
                className={btn("ghost", "sm", "shrink-0")}
              >
                {r.enabled ? "On" : "Off"}
              </button>
              <button
                onClick={() => remove(r.id)}
                className={btn("ghost", "sm", "shrink-0")}
                aria-label="delete rule"
              >
                <Trash2 size={13} strokeWidth={1.9} />
              </button>
            </div>
            <div className="t-caption mt-1 flex flex-wrap items-center gap-x-2">
              <span>{r.target === "any" ? "any tool" : r.target}</span>
              <span aria-hidden="true">·</span>
              <span>{r.verb === "any" ? "any action" : r.verb}</span>
              {r.condition.kind === "amount" && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    amount {r.condition.op} ${r.condition.value}
                  </span>
                </>
              )}
              {r.condition.kind === "channel" && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{String(r.condition.match)}</span>
                </>
              )}
              {r.condition.kind === "label" && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>label “{r.condition.match}”</span>
                </>
              )}
              {r.confidence === "low" && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-signal">low confidence</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

