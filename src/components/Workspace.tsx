"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionRecord, ActionStatus, MessageRecord, SessionRecord } from "@/lib/types";
import { getRealtimeClient } from "@/lib/client/realtime";
import { ActionCard } from "./ActionCard";
import { SkeletonCard } from "./Skeleton";
import { useToast } from "./Toast";
import { VoiceOrb, type OrbState } from "./VoiceOrb";
import { EmptyIllustration } from "./EmptyIllustration";
import { OfferBanner } from "./OfferBanner";
import { useKeyboardHints } from "@/lib/useKeyboardHints";
import { useFaviconStatus } from "@/lib/useFaviconStatus";

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
    throw new Error(body.message || body.error || "something went wrong — try again.");
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
  const [keyHints] = useKeyboardHints();
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
  const pendingActions = useMemo(
    () => displayActions.filter((a) => a.status === "proposed"),
    [displayActions]
  );
  const settledActions = useMemo(
    () => displayActions.filter((a) => a.status !== "proposed"),
    [displayActions]
  );

  const orbState: OrbState = thinking
    ? "thinking"
    : pendingActions.length > 0
      ? "awaiting-approval"
      : listening
        ? "listening"
        : "idle";

  // Living logo in the browser tab: badge the favicon while actions wait.
  useFaviconStatus(pendingActions.length > 0);

  const refresh = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
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
    setCommand("");
    try {
      const data = await jsonFetch("/api/command", {
        method: "POST",
        body: JSON.stringify({ command: cmd, sessionId: session?.id }),
      });
      setSession(data.session);
      sessionRef.current = data.session.id;
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "the command didn't go through — try again.");
      setCommand(cmd); // never lose the user's input
    } finally {
      setThinking(false);
    }
  }

  const onApprove = useCallback(
    async (id: string, opts: { confirmation?: string }) => {
      setOptimistic((o) => ({ ...o, [id]: "executing" }));
      try {
        const data = await jsonFetch(`/api/actions/${id}/approve`, {
          method: "POST",
          body: JSON.stringify(opts),
        });
        await refresh();
        toast(
          data.action.status === "executed" ? "success" : "error",
          data.action.status === "executed"
            ? "signed & executed."
            : "the action didn't complete — check the card."
        );
        return null;
      } catch (err) {
        setOptimistic((o) => {
          const next = { ...o };
          delete next[id];
          return next;
        });
        await refresh();
        return err instanceof Error ? err.message : "approval didn't go through — try again.";
      }
    },
    [refresh, toast]
  );

  const onVeto = useCallback(
    async (id: string, reason: string) => {
      setOptimistic((o) => ({ ...o, [id]: "vetoed" }));
      try {
        await jsonFetch(`/api/actions/${id}/veto`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        await refresh();
        toast("success", "vetoed — nothing was executed.");
        return null;
      } catch (err) {
        setOptimistic((o) => {
          const next = { ...o };
          delete next[id];
          return next;
        });
        await refresh();
        return err instanceof Error ? err.message : "the veto didn't go through — try again.";
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
        return err instanceof Error ? err.message : "the edit didn't save — try again.";
      }
    },
    [refresh]
  );

  return (
    <div className="flex-1 px-4 py-6">
    <OfferBanner />
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(320px,5fr)_minmax(380px,7fr)]">
      {/* Left: command input + session thread */}
      <section className="flex flex-col gap-4">
        <div className={`rounded-card bg-white/70 p-4 shadow-lift ${thinking ? "animate-ring-flash" : ""}`}>
          <label
            htmlFor="command"
            className="text-xs font-extrabold lowercase tracking-widest text-ink-soft"
          >
            command the operator
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
            placeholder={'tell cosigno what to do…  (press "/" to focus, ↑ recalls)'}
            rows={3}
            className="mt-2 w-full resize-none rounded-btn bg-transparent text-lg font-semibold placeholder:text-ink-soft/60 focus:outline-none"
          />

          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold lowercase text-ink-soft">
                ↹ complete:
              </span>
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onClick={() => acceptSuggestion(s)}
                  className="rounded-pill bg-cream-deep px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-ink hover:text-cream"
                >
                  {s}
                  {i === 0 && <span className="ml-1 text-[9px] text-ink-soft">tab</span>}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-ink-soft">
              enter (or ⌘/ctrl+enter) to send · shift+enter for a new line · esc to clear
            </span>
            <button
              onClick={() => submit(command)}
              disabled={thinking || !command.trim()}
              className="rounded-btn bg-ink px-5 py-2 text-sm font-extrabold text-cream transition-transform active:scale-95 disabled:opacity-40"
            >
              {thinking ? "planning…" : "send"}
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-card bg-cream-deep px-4 py-3 text-sm font-semibold shadow-soft" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {messages.length === 0 && !thinking && (
            <div className="rounded-card bg-white/40 p-5 shadow-soft">
              <p className="text-sm font-bold text-ink-soft">try one of these:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => submit(ex)}
                    className="rounded-btn bg-cream-deep px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-cream"
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
                className="self-end rounded-card rounded-br-md bg-ink px-4 py-2.5 text-sm font-semibold text-cream"
              >
                {m.content}
              </p>
            ) : (
              <div key={m.id} className="self-start">
                <button
                  onClick={() =>
                    setReasoningOpen((s) => ({ ...s, [m.id]: !s[m.id] }))
                  }
                  className="text-xs font-bold lowercase text-ink-soft underline underline-offset-2"
                  aria-expanded={Boolean(reasoningOpen[m.id])}
                >
                  {reasoningOpen[m.id] ? "hide reasoning" : "operator reasoning"}
                </button>
                {reasoningOpen[m.id] && (
                  <p className="mt-1 max-w-md rounded-card rounded-bl-md bg-white/60 px-4 py-2.5 text-sm text-ink-soft shadow-soft">
                    {m.content}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </section>

      {/* Right: action card stack */}
      <section className="flex flex-col gap-3" aria-live="polite">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold lowercase tracking-widest text-ink-soft">
            action cards
          </h2>
          <VoiceOrb state={orbState} />
        </div>

        {thinking && <SkeletonCard />}

        {actions.length === 0 && !thinking && (
          <div className="flex flex-col items-center rounded-card bg-white/40 p-8 text-center shadow-soft">
            <EmptyIllustration kind="workspace" className="mb-3" />
            <p className="max-w-sm text-sm font-semibold text-ink-soft">
              nothing proposed yet. give the operator a command — every
              consequential step lands here as a card for your signature.
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
          />
        ))}

        {settledActions.length > 0 && (
          <details className="mt-2" open={pendingActions.length === 0}>
            <summary className="cursor-pointer text-xs font-bold lowercase tracking-widest text-ink-soft">
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
