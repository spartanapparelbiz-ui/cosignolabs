"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Pencil, ShieldAlert, Search } from "lucide-react";
import { CREAM } from "@/lib/brand";
import { track } from "@/lib/analytics";

/**
 * The landing-page sandbox: the real approval loop against simulated tools.
 * Cards live in this component's state only — reload and they're gone. The
 * backing route is stateless and physically cannot reach the model or the
 * database (see /api/preview).
 *
 * Interactivity: a command palette (press "/" or focus the input) with six
 * grouped suggestions, arrow-key navigable; a "what just happened" expander
 * on each executed card revealing the audit row that was written; and a
 * shareable outcome link once the session cap is reached.
 */

interface PaletteItem {
  group: string;
  command: string;
}

const PALETTE: PaletteItem[] = [
  { group: "inbox", command: "clear my inbox of newsletters" },
  { group: "inbox", command: "draft replies to 3 leads" },
  { group: "inbox", command: "check my mail" },
  { group: "store", command: "summarize this week's orders" },
  { group: "store", command: "reprice products for the summer sale" },
  { group: "calendar", command: "schedule a follow-up for next tuesday" },
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
  /** how it resolved, for the audit row */
  audit?: { via: "auto" | "approved"; at: string };
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
  const [approvals, setApprovals] = useState(0);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [auditOpen, setAuditOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const confirmText = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const capped = used >= MAX_COMMANDS;

  // "/" focuses the sandbox input and opens the palette, unless the visitor
  // is already typing in a field elsewhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        if (!capped) setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capped]);

  function patch(id: string, p: Partial<PreviewCard>) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  async function run(command: string) {
    const cmd = command.trim().slice(0, 200);
    if (!cmd || busy || capped) return;
    setPaletteOpen(false);
    setBusy(true);
    setError(null);
    setInput("");
    track("preview_command");
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
      for (const c of fresh) {
        if (c.tier === 1 && !c.injection_flag) {
          setTimeout(() => execute(c.id, c.category, "auto"), 700);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "the sandbox hiccuped — try again.");
      setInput(cmd);
    } finally {
      setBusy(false);
    }
  }

  function execute(id: string, category: string, via: "auto" | "approved") {
    patch(id, { status: "executing" });
    setTimeout(() => {
      patch(id, {
        status: "executed",
        result: RESULTS[category] ?? "done (simulated).",
        audit: { via, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
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
    setApprovals((a) => a + 1);
    track("preview_approve", { tier: card.tier });
    patch(card.id, { error: undefined });
    execute(card.id, card.category, "approved");
  }

  function toggleAudit(id: string) {
    setAuditOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        track("preview_audit_open");
      }
      return next;
    });
  }

  async function copyShare() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}/#try` : "https://cosignolabs.com/#try";
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      track("preview_share");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (paletteOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPaletteIdx((i) => (i + 1) % PALETTE.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPaletteIdx((i) => (i - 1 + PALETTE.length) % PALETTE.length);
        return;
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        return;
      }
      if (e.key === "Enter" && !input.trim()) {
        e.preventDefault();
        run(PALETTE[paletteIdx].command);
        return;
      }
    }
    if (e.key === "Enter") run(input);
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-card bg-surface/70 p-4 shadow-lift sm:p-5">
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
          <div className="relative mt-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={15}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
                />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setPaletteOpen(true)}
                  onBlur={() => setTimeout(() => setPaletteOpen(false), 120)}
                  onKeyDown={onInputKeyDown}
                  maxLength={200}
                  placeholder='type a command, or press "/" for suggestions'
                  className="w-full rounded-btn bg-cream-deep py-2 pl-9 pr-3 text-sm font-semibold placeholder:text-ink-soft/60"
                  aria-label="sandbox command"
                  role="combobox"
                  aria-expanded={paletteOpen}
                  aria-controls="preview-palette"
                />
              </div>
              <button
                onClick={() => run(input)}
                disabled={busy || !input.trim()}
                className="rounded-btn bg-ink px-4 py-2 text-sm font-extrabold text-cream transition-transform active:scale-95 disabled:opacity-40"
              >
                {busy ? "planning…" : "send"}
              </button>
            </div>

            {/* command palette */}
            {paletteOpen && (
              <div
                id="preview-palette"
                role="listbox"
                className="absolute z-20 mt-2 w-full overflow-hidden rounded-card bg-surface shadow-lift ring-1 ring-inset ring-ink/10 animate-fade-through"
              >
                {["inbox", "store", "calendar"].map((group) => (
                  <div key={group}>
                    <p className="bg-cream-deep px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
                      {group}
                    </p>
                    {PALETTE.map((item, i) =>
                      item.group === group ? (
                        <button
                          key={item.command}
                          role="option"
                          aria-selected={paletteIdx === i}
                          onMouseEnter={() => setPaletteIdx(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            run(item.command);
                          }}
                          className={`flex min-h-[40px] w-full items-center px-3 py-2 text-left text-sm font-semibold transition-colors ${
                            paletteIdx === i ? "bg-signal/10 text-ink" : "hover:bg-cream-deep"
                          }`}
                        >
                          {item.command}
                        </button>
                      ) : null
                    )}
                  </div>
                ))}
                <p className="px-3 py-1.5 text-[10px] text-ink-soft">
                  ↑↓ to move · enter to run · esc to close
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-card bg-cream-deep p-4 text-center">
          <p className="text-sm font-bold">
            you approved {approvals} {approvals === 1 ? "action" : "actions"} in the cosigno sandbox.
          </p>
          <p className="mt-1 text-xs text-ink-soft">want it on your real tools?</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link
              href="#beta"
              className="inline-flex min-h-[44px] items-center rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink transition-transform hover:scale-[1.02]"
            >
              apply for the founding beta
            </Link>
            <button
              onClick={copyShare}
              className="inline-flex min-h-[44px] items-center rounded-btn px-5 py-2.5 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-colors hover:bg-surface/60"
            >
              {copied ? "link copied ✓" : "copy a shareable link"}
            </button>
          </div>
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
              className="flex items-center gap-2.5 rounded-card bg-surface/50 px-3.5 py-2 opacity-70 shadow-soft"
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
              className="animate-card-in rounded-card bg-surface/80 p-3.5 shadow-soft"
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
              <pre className="mt-2 max-h-24 overflow-auto rounded-btn bg-cream-deep px-2.5 py-2 font-mono text-[10px] leading-relaxed shadow-well">
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
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-btn bg-signal px-4 py-1.5 text-xs font-extrabold text-ink transition-transform hover:scale-[1.03] active:scale-95"
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
                    className="min-h-[40px] rounded-btn px-3.5 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
                  >
                    veto
                  </button>
                  <span className="inline-flex items-center gap-1 text-[10px] lowercase text-ink-soft">
                    <Pencil size={10} aria-hidden="true" /> edit lives in the full app
                  </span>
                </div>
              )}

              {card.status === "executed" && (
                <>
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
                  {/* what just happened — the audit row that was written */}
                  <button
                    onClick={() => toggleAudit(card.id)}
                    aria-expanded={auditOpen.has(card.id)}
                    className="mt-2 text-[11px] font-bold lowercase text-ink-soft underline underline-offset-2"
                  >
                    {auditOpen.has(card.id) ? "hide the audit row" : "what just happened?"}
                  </button>
                  {auditOpen.has(card.id) && card.audit && (
                    <pre className="mt-1.5 overflow-x-auto rounded-btn bg-ink px-2.5 py-2 font-mono text-[10px] leading-relaxed text-cream animate-fade-through">
{`audit_log ← {
  event:    "${card.audit.via === "auto" ? "auto_executed" : "approved+executed"}",
  action:   "${card.category}",
  tier:     ${card.tier},
  actor:    "you",
  at:       "${card.audit.at}",
  payload:  { ${Object.keys(card.payload).join(", ")} }
}`}
                    </pre>
                  )}
                </>
              )}
            </article>
          )
        )}
      </div>
    </div>
  );
}
