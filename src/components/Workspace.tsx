"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionRecord, ActionStatus, MessageRecord, SessionRecord } from "@/lib/types";
import { getRealtimeClient } from "@/lib/client/realtime";
import { ActionCard } from "./ActionCard";
import { SkeletonCard } from "./Skeleton";
import { LogoStatus, type LogoStatusState } from "./LogoStatus";
import { ThinkingStatus, type PlanResolution } from "./ThinkingStatus";
import { useToast } from "./Toast";
import { EmptyIllustration } from "./EmptyIllustration";
import { OfferBanner } from "./OfferBanner";
import { useKeyboardHints } from "@/lib/useKeyboardHints";
import { useFaviconStatus } from "@/lib/useFaviconStatus";
import { sessionCounts, sessionCountsLine } from "@/lib/actionPresentation";
import { MissionGuide, MissionStatus } from "./MissionGuide";
import { badge, btn, card, dot, field } from "@/components/ui/styles";

/** Static keyword set for inline command autocomplete. */
const COMMAND_KEYWORDS = [
  "archive", "draft", "reply", "summarize", "reprice", "schedule",
  "refund", "unsubscribe", "forward", "label", "follow up", "update",
];

const EXAMPLES = [
  "clear my inbox of newsletters",
  "draft replies to these 3 leads",
  "reprice these products for the summer sale",
];

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.error || "Something went wrong — try again.");
  }
  return body;
}

export function Workspace() {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [command, setCommand] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>({});
  // Optimistic status overrides, rolled back if the server rejects.
  const [optimistic, setOptimistic] = useState<Record<string, ActionStatus>>({});
  const [lastCommand, setLastCommand] = useState("");
  // How the last plan resolved — drives the status line's final state.
  const [resolution, setResolution] = useState<PlanResolution | null>(null);
  // Cards that just finished stay in the main stack for a beat so the user
  // SEES the result land before they tuck under the resolved divider.
  const [justResolved, setJustResolved] = useState<Record<string, true>>({});
  const holdInStack = useCallback((ids: string[], ms = 5000) => {
    if (ids.length === 0) return;
    setJustResolved((s) => {
      const next = { ...s };
      for (const id of ids) next[id] = true;
      return next;
    });
    window.setTimeout(() => {
      setJustResolved((s) => {
        const next = { ...s };
        for (const id of ids) delete next[id];
        return next;
      });
    }, ms);
  }, []);
  const [keyHints] = useKeyboardHints();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Always-fresh submit for stable callbacks (same pattern as sessionRef).
  const submitRef = useRef<((text: string) => void) | null>(null);

  // Inline keyword autocomplete on the current (last) token.
  const suggestions = useMemo(() => {
    const token = command.split(/\s+/).pop()?.toLowerCase() ?? "";
    if (token.length < 2) return [];
    return COMMAND_KEYWORDS.filter(
      (k) => k.startsWith(token) && k !== token
    ).slice(0, 3);
  }, [command]);

  function acceptSuggestion(word: string) {
    setCommand((prev) => {
      const parts = prev.split(/(\s+)/); // keep separators
      // replace the final non-space token
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].trim().length) {
          parts[i] = word;
          break;
        }
      }
      return parts.join("") + " ";
    });
    inputRef.current?.focus();
  }
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = session?.id ?? null;
  const toast = useToast();

  const displayActions = useMemo(
    () =>
      actions.map((a) =>
        optimistic[a.id] && a.status === "proposed"
          ? { ...a, status: optimistic[a.id] }
          : a
      ),
    [actions, optimistic]
  );
  // The main stack: awaiting cards, in-flight cards, and anything that just
  // finished (held briefly so its result is seen before it tucks away).
  const pendingActions = useMemo(
    () =>
      displayActions.filter(
        (a) =>
          a.status === "proposed" ||
          a.status === "approved" ||
          a.status === "executing" ||
          justResolved[a.id]
      ),
    [displayActions, justResolved]
  );
  const settledActions = useMemo(
    () => displayActions.filter((a) => !pendingActions.includes(a)),
    [displayActions, pendingActions]
  );
  const awaitingCount = useMemo(
    () => displayActions.filter((a) => a.status === "proposed").length,
    [displayActions]
  );
  const counts = useMemo(() => sessionCounts(displayActions), [displayActions]);

  // Brief post-event beats (success settle / calm error dim) on the mark.
  const [flash, setFlash] = useState<"success" | "error" | null>(null);
  const flashTimer = useRef<number | null>(null);
  const pulse = useCallback((kind: "success" | "error") => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlash(kind);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1200);
  }, []);

  const executingNow = useMemo(
    () =>
      displayActions.some(
        (a) => a.status === "approved" || a.status === "executing"
      ),
    [displayActions]
  );

  // The logo IS the status light. Real lifecycle, one state at a time:
  // planning > executing > awaiting-signature > post-event beat > listening.
  const logoState: LogoStatusState = thinking
    ? "working"
    : executingNow
      ? "executing"
      : awaitingCount > 0
        ? "awaiting"
        : flash
          ? flash === "success"
            ? "success"
            : "error"
          : listening
            ? "listening"
            : "idle";

  // Living logo in the browser tab: badge the favicon while actions wait.
  useFaviconStatus(awaitingCount > 0);

  const refresh = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    // Polling fallback only — a hidden tab skips the fetch (realtime pushes
    // don't fire this path, and the next visible tick catches up).
    if (document.visibilityState === "hidden") return;
    try {
      const data = await jsonFetch(`/api/sessions/${id}`);
      setMessages(data.messages);
      setActions(data.actions);
      setOptimistic({});
    } catch {
      // transient; next poll retries
    }
  }, []);

  // Realtime when Supabase is configured; polling fallback otherwise.
  useEffect(() => {
    if (!session) return;
    let channel: { unsubscribe: () => void } | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    getRealtimeClient().then((client) => {
      if (cancelled) return;
      if (client) {
        channel = client
          .channel(`actions-${session.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "actions",
              filter: `session_id=eq.${session.id}`,
            },
            () => refresh()
          )
          .subscribe();
      } else {
        interval = setInterval(refresh, 3000);
      }
    });

    return () => {
      cancelled = true;
      channel?.unsubscribe();
      if (interval) clearInterval(interval);
    };
  }, [session, refresh]);

  // "/" focuses the command box from anywhere; Esc clears it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit(text: string) {
    const cmd = text.trim();
    if (!cmd || thinking) return;
    setLastCommand(cmd);
    setThinking(true);
    setError(null);
    setResolution(null);
    setCommand("");
    try {
      const data = await jsonFetch("/api/command", {
        method: "POST",
        body: JSON.stringify({ command: cmd, sessionId: session?.id }),
      });
      setSession(data.session);
      sessionRef.current = data.session.id;
      const planned: ActionRecord[] = data.actions ?? [];
      // Auto-executed (tier-1) cards arrive already done — hold them in the
      // stack briefly so their results are actually seen.
      holdInStack(
        planned
          .filter((a) => a.status === "executed" || a.status === "failed")
          .map((a) => a.id),
        6000
      );
      setResolution({
        count: planned.length,
        injected: planned.some((a) => a.injection_flag),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The command didn't go through — try again.");
      setCommand(cmd); // never lose the user's input
      pulse("error");
    } finally {
      setThinking(false);
    }
  }
  submitRef.current = submit;

  const onApprove = useCallback(
    // The whole opts object posts through — a drawn signature (SIGN) rides
    // along to the authorization record exactly like in the decision inbox.
    async (id: string, opts: { confirmation?: string; signature?: { name: string; image?: string } }) => {
      setOptimistic((o) => ({ ...o, [id]: "executing" }));
      try {
        const data = await jsonFetch(`/api/actions/${id}/approve`, {
          method: "POST",
          body: JSON.stringify(opts),
        });
        // Keep the card in place while its executed state (check + result)
        // lands — it tucks under the resolved divider a beat later.
        holdInStack([id]);
        await refresh();
        pulse(data.action.status === "executed" ? "success" : "error");
        toast(
          data.action.status === "executed" ? "success" : "error",
          data.action.status === "executed"
            ? "signed & executed."
            : "The action didn't complete — check the card."
        );
        return null;
      } catch (err) {
        setOptimistic((o) => {
          const next = { ...o };
          delete next[id];
          return next;
        });
        await refresh();
        return err instanceof Error ? err.message : "Approval didn't go through — try again.";
      }
    },
    [refresh, toast, holdInStack]
  );

  // A failed card's "propose again": re-issue the action as a fresh command
  // through the full pipeline (plan → propose → approve) — never a bypass.
  const onRetry = useCallback((action: ActionRecord) => {
    submitRef.current?.(action.summary);
  }, []);

  // Stop mission: veto every waiting step at once. Nothing pending survives,
  // and each veto is a normal engine transition (logged like any other).
  const stopMission = useCallback(async () => {
    const waiting = actions.filter((a) => a.status === "proposed");
    for (const a of waiting) {
      await jsonFetch(`/api/actions/${a.id}/veto`, {
        method: "POST",
        body: JSON.stringify({ reason: "mission stopped by user" }),
      }).catch(() => {});
    }
    await refresh();
    toast("success", "Mission stopped — the waiting steps were vetoed and nothing else will run.");
  }, [actions, refresh, toast]);

  const onVeto = useCallback(
    async (id: string, reason: string) => {
      setOptimistic((o) => ({ ...o, [id]: "vetoed" }));
      try {
        await jsonFetch(`/api/actions/${id}/veto`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        await refresh();
        toast("success", "Vetoed — nothing was executed.");
        return null;
      } catch (err) {
        setOptimistic((o) => {
          const next = { ...o };
          delete next[id];
          return next;
        });
        await refresh();
        return err instanceof Error ? err.message : "The veto didn't go through — try again.";
      }
    },
    [refresh, toast]
  );

  const onEdit = useCallback(
    async (id: string, payload: Record<string, unknown>) => {
      try {
        await jsonFetch(`/api/actions/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ payload }),
        });
        await refresh();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "The edit didn't save — try again.";
      }
    },
    [refresh]
  );

  return (
    <div className="flex flex-1 flex-col px-5 py-8 sm:px-8">
    <OfferBanner />
    {/* flex-1 + stretched row: both panels fill the viewport below the nav
        instead of sitting content-height with a dead zone beneath. */}
    <div className="mx-auto grid w-full max-w-none flex-1 grid-rows-[auto_minmax(0,1fr)] gap-6 lg:min-h-0 lg:grid-cols-[minmax(320px,5fr)_minmax(380px,7fr)] lg:grid-rows-[minmax(0,1fr)]">
      {/* Left: command input + session thread */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className={`${card()} p-5 ${thinking ? "animate-ring-flash" : ""}`}>
          <label htmlFor="command" className="t-eyebrow">
            What should cosigno handle?
          </label>
          <textarea
            id="command"
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onFocus={() => setListening(true)}
            onBlur={() => setListening(false)}
            onKeyDown={(e) => {
              // cmd/ctrl+enter always submits; plain enter submits (shift = newline)
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                submit(command);
                return;
              }
              // Tab accepts the top inline suggestion
              if (e.key === "Tab" && suggestions.length > 0) {
                e.preventDefault();
                acceptSuggestion(suggestions[0]);
                return;
              }
              // up-arrow on an empty box recalls the last command
              if (e.key === "ArrowUp" && !command.trim() && lastCommand) {
                e.preventDefault();
                setCommand(lastCommand);
                return;
              }
              if (e.key === "Escape") {
                setCommand("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Describe the outcome you want…"
            rows={3}
            className="mt-2.5 w-full resize-none rounded-btn bg-transparent text-[1.0625rem] placeholder:text-ink-soft/60 focus:outline-none"
          />

          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.75rem] font-semibold text-ink-soft">
                ↹ complete:
              </span>
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onClick={() => acceptSuggestion(s)}
                  className={btn("ghost", "sm")}
                >
                  {s}
                  {i === 0 && <span className="t-caption ml-1">tab</span>}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="t-caption">Enter to send · shift+enter for a new line</span>
            <button
              onClick={() => submit(command)}
              disabled={thinking || !command.trim()}
              className={btn("primary", "md")}
            >
              {thinking ? "Planning…" : "Send"}
            </button>
          </div>
          <ThinkingStatus thinking={thinking} resolution={resolution} />
        </div>

        {error && (
          <p className="t-body border-l-2 border-danger pl-3.5 text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {messages.length === 0 && !thinking && (
            <div>
              <p className="t-eyebrow">Try</p>
              <div className="-ml-2 mt-1.5 flex flex-col items-start">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => submit(ex)}
                    className="rounded-btn px-2 py-1.5 text-left text-[1rem] text-ink-soft transition-colors duration-fast hover:text-ink"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <p
                key={m.id}
                className="self-end rounded-card rounded-br-md bg-ink px-4 py-2.5 text-[0.9375rem] text-cream"
              >
                {m.content}
              </p>
            ) : (
              <div key={m.id} className="self-start">
                <button
                  onClick={() =>
                    setReasoningOpen((s) => ({ ...s, [m.id]: !s[m.id] }))
                  }
                  className="text-xs font-semibold text-ink-soft underline underline-offset-2"
                  aria-expanded={Boolean(reasoningOpen[m.id])}
                >
                  {reasoningOpen[m.id] ? "hide reasoning" : "operator reasoning"}
                </button>
                {reasoningOpen[m.id] && (
                  <p className="t-body mt-1.5 max-w-md rounded-card rounded-bl-md bg-surface px-4 py-2.5 text-ink-soft shadow-rest">
                    {m.content}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </section>

      {/* Right: action card stack — fills the column and scrolls internally
          when the stack outgrows the viewport (page never goes short). */}
      <section
        className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto lg:max-h-[calc(100dvh-8.5rem)]"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="t-eyebrow">Waiting on you</h2>
          <MissionStatus actions={displayActions} planning={thinking} />
          {/* the living logo is the status light — the one live indicator */}
          <span className="ml-auto min-w-0">
            <LogoStatus state={logoState} awaiting={awaitingCount} />
          </span>
        </div>
        {sessionCountsLine(counts) && (
          <p className="t-caption -mt-1.5">{sessionCountsLine(counts)}</p>
        )}

        <MissionGuide actions={displayActions} planning={thinking} onStop={stopMission} />

        {thinking && <SkeletonCard />}

        {actions.length === 0 && !thinking && (
          /* my-auto: the empty state sits centered in the panel's height,
             not crammed at the top with a dead zone under it. */
          <div className="my-auto flex flex-col items-center px-6 text-center">
            <EmptyIllustration kind="workspace" className="mb-5 opacity-70" />
            <p className="t-caption max-w-[24rem]">
              Nothing proposed yet. Give cosigno a command — every consequential step
              lands here as a card for your signature.
            </p>
          </div>
        )}

        {pendingActions.map((a, i) => (
          <ActionCard
            key={a.id}
            action={a}
            index={i}
            showKeyHints={keyHints}
            onApprove={onApprove}
            onVeto={onVeto}
            onEdit={onEdit}
            onRetry={onRetry}
          />
        ))}

        {settledActions.length > 0 && (
          <details className="mt-2" open={pendingActions.length === 0}>
            <summary className="cursor-pointer text-xs font-semibold tracking-[0.1em] text-ink-soft">
              resolved ({settledActions.length})
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {settledActions.map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  onApprove={onApprove}
                  onVeto={onVeto}
                  onEdit={onEdit}
                  onRetry={onRetry}
                />
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
    </div>
  );
}
