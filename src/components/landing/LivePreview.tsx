"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Lock, Pencil, ShieldAlert } from "lucide-react";
import { CREAM } from "@/lib/brand";

/**
 * The landing-page sandbox: the real approval loop against simulated
 * tools. Cards live in this component's state only — reload and they're
 * gone. The backing route is stateless and physically cannot reach the
 * model or the database (see /api/preview).
 */

const PRESETS = [
  "clear my inbox of newsletters",
  "draft replies to 3 leads",
  "summarize this week's orders",
  "check my mail",
];

const MAX_COMMANDS = 5;

interface PreviewCard {
  id: string;
  category: string;
  tier: 1 | 2 | 3;
  summary: string;
  payload: Record<string, unknown>;
  injection_flag: boolean;
  tier_note: string | null;
  status: "proposed" | "executing" | "executed" | "vetoed";
  result?: string;
  error?: string;
}

const RESULTS: Record<string, string> = {
  search: "search completed — 47 matches (simulated).",
  summarize: "summary generated and saved to this thread (simulated).",
  draft: "draft saved. nothing was sent (simulated).",
  send_email: "email queued (simulated).",
  update_record: "47 emails archived and labeled (simulated).",
  spend: "spend recorded (simulated).",
  webhook: "webhook fired (simulated).",
  post_content: "content posted (simulated).",
  delete: "deleted (simulated).",
  refund: "refund issued (simulated).",
  payment: "payment sent (simulated).",
};

function TierChip({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-bold lowercase tracking-wide ${
        tier === 1
          ? "bg-cream-deep text-ink-soft"
          : tier === 3
            ? "bg-ink text-cream"
            : "bg-ink/5 text-ink ring-1 ring-inset ring-ink/20"
      }`}
    >
      {tier === 3 && <Lock size={9} strokeWidth={2.5} aria-hidden="true" />}
      tier {tier} · {tier === 1 ? "auto" : tier === 2 ? "approve" : "locked"}
    </span>
  );
}

export default function LivePreview() {
  const [cards, setCards] = useState<PreviewCard[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(0);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const confirmText = useRef<HTMLInputElement>(null);

  const capped = used >= MAX_COMMANDS;

  function patch(id: string, p: Partial<PreviewCard>) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  async function run(command: string) {
    const cmd = command.trim().slice(0, 200);
    if (!cmd || busy || capped) return;
    setBusy(true);
    setError(null);
    setInput("");
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "the sandbox hiccuped — try again.");
      setUsed((u) => u + 1);
      setReasoning(data.reasoning);
      const fresh: PreviewCard[] = data.cards.map((c: Omit<PreviewCard, "status">) => ({
        ...c,
        status: "proposed" as const,
      }));
      setCards((cs) => [...fresh, ...cs]);
      // Tier-1 cards auto-execute (still visible, still "logged") unless held.
      for (const c of fresh) {
        if (c.tier === 1 && !c.injection_flag) {
          setTimeout(() => execute(c.id, c.category), 700);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "the sandbox hiccuped — try again.");
      setInput(cmd);
    } finally {
      setBusy(false);
    }
  }

  function execute(id: string, category: string) {
    patch(id, { status: "executing" });
    setTimeout(() => {
      patch(id, {
        status: "executed",
        result: RESULTS[category] ?? "done (simulated).",
      });
    }, 650);
  }

  function approve(card: PreviewCard) {
    if (card.injection_flag) {
      patch(card.id, {
        error:
          "this card was held: external content attempted to direct the agent. it can't be executed — re-issue the command yourself if you want this done.",
      });
      return;
    }
    if (card.tier === 3) {
      if (confirmFor !== card.id) {
        setConfirmFor(card.id);
        return;
      }
      const typed = confirmText.current?.value.trim().toLowerCase();
      if (typed !== card.category.toLowerCase()) {
        patch(card.id, { error: `that didn't match. type "${card.category}" exactly to approve.` });
        return;
      }
      setConfirmFor(null);
    }
    patch(card.id, { error: undefined });
    execute(card.id, card.category);
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-card bg-white/70 p-4 shadow-lift sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-pill bg-cream-deep px-2.5 py-1 text-[10px] font-bold lowercase tracking-widest text-ink-soft">
          sandbox — simulated tools
        </span>
        <span className="ml-auto text-[11px] text-ink-soft">
          {capped ? "session cap reached" : `${MAX_COMMANDS - used} commands left`}
        </span>
      </div>

      {!capped ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => run(p)}
                disabled={busy}
                className="rounded-btn bg-cream-deep px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-ink hover:text-cream disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run(input)}
              maxLength={200}
              placeholder="or type your own command…"
              className="min-w-0 flex-1 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold placeholder:text-ink-soft/60"
              aria-label="sandbox command"
            />
            <button
              onClick={() => run(input)}
              disabled={busy || !input.trim()}
              className="rounded-btn bg-ink px-4 py-2 text-sm font-extrabold text-cream transition-transform active:scale-95 disabled:opacity-40"
            >
              {busy ? "planning…" : "send"}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-card bg-cream-deep p-4 text-center">
          <p className="text-sm font-bold">want it on your real tools?</p>
          <Link
            href="#beta"
            className="mt-2 inline-block rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink transition-transform hover:scale-[1.02]"
          >
            apply for the founding beta
          </Link>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
          {error}
        </p>
      )}

      {reasoning && (
        <p className="mt-3 text-xs text-ink-soft">
          <span className="font-bold lowercase">operator: </span>
          {reasoning}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2.5" aria-live="polite">
        {cards.map((card) =>
          card.status === "vetoed" ? (
            <div
              key={card.id}
              className="flex items-center gap-2.5 rounded-card bg-white/50 px-3.5 py-2 opacity-70 shadow-soft"
            >
              <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-ink/40" />
              <span className="truncate text-xs font-semibold text-ink-soft line-through decoration-ink/40">
                {card.summary}
              </span>
              <span className="ml-auto shrink-0 text-[10px] lowercase text-ink-soft">vetoed</span>
            </div>
          ) : (
            <article
              key={card.id}
              className="animate-card-in rounded-card bg-white/80 p-3.5 shadow-soft"
            >
              <div className="flex flex-wrap items-center gap-2">
                <TierChip tier={card.tier} />
                <span
                  className={`rounded-pill px-2 py-0.5 text-[10px] font-bold lowercase ${
                    card.status === "executed"
                      ? "bg-signal text-cream"
                      : "bg-cream-deep text-ink-soft"
                  }`}
                >
                  {card.status === "proposed"
                    ? "awaiting your sign-off"
                    : card.status === "executing"
                      ? "executing…"
                      : "executed"}
                </span>
              </div>

              {card.injection_flag && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-ink px-2.5 py-1 text-[10px] font-bold lowercase text-cream">
                  <ShieldAlert size={11} strokeWidth={2.5} aria-hidden="true" />
                  external content attempted to direct the agent — held for your review
                </p>
              )}
              {card.tier_note && (
                <p className="mt-2 rounded-btn bg-cream-deep px-2.5 py-1.5 text-[11px] text-ink-soft">
                  {card.tier_note}
                </p>
              )}

              <p className="mt-2 text-sm font-semibold leading-snug">{card.summary}</p>
              <pre className="mt-2 max-h-24 overflow-auto rounded-btn bg-cream-deep px-2.5 py-2 font-mono text-[10px] leading-relaxed">
                {JSON.stringify(card.payload, null, 2)}
              </pre>

              {card.error && (
                <p className="mt-2 rounded-btn bg-cream-deep px-2.5 py-1.5 text-[11px] font-semibold" role="alert">
                  {card.error}
                </p>
              )}

              {card.status === "proposed" && confirmFor === card.id && (
                <div className="mt-2 rounded-btn bg-cream-deep p-2.5">
                  <p className="text-[11px] font-bold">
                    this is a locked action. type its name to approve:{" "}
                    <code className="rounded bg-cream px-1 font-mono">{card.category}</code>
                  </p>
                  <input
                    ref={confirmText}
                    placeholder={card.category}
                    className="mt-1.5 w-full rounded-btn bg-cream px-2.5 py-1.5 text-xs"
                    aria-label="type the action name to confirm"
                  />
                </div>
              )}

              {card.status === "proposed" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => approve(card)}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-4 py-1.5 text-xs font-extrabold text-ink transition-transform hover:scale-[1.03] active:scale-95"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M4.5 12.5 10 18 20 6.5"
                        stroke="currentColor"
                        strokeWidth="3.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {confirmFor === card.id ? "confirm & approve" : "approve"}
                  </button>
                  <button
                    onClick={() => patch(card.id, { status: "vetoed" })}
                    className="rounded-btn px-3.5 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
                  >
                    veto
                  </button>
                  <span className="inline-flex items-center gap-1 text-[10px] lowercase text-ink-soft">
                    <Pencil size={10} aria-hidden="true" /> edit lives in the full app
                  </span>
                </div>
              )}

              {card.status === "executed" && (
                <div className="mt-2.5 flex items-center gap-1.5 text-signal">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="animate-check-pop" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" fill="currentColor" />
                    <path
                      d="M6.5 12.5 10.5 16.5 17.5 8.5"
                      stroke={CREAM}
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="24"
                      className="animate-check-draw"
                    />
                  </svg>
                  <span className="text-[11px] font-extrabold lowercase">{card.result}</span>
                </div>
              )}
            </article>
          )
        )}
      </div>
    </div>
  );
}
