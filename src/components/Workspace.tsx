"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionRecord, MessageRecord, SessionRecord } from "@/lib/types";
import { getRealtimeClient } from "@/lib/client/realtime";
import { ActionCard } from "./ActionCard";
import { VoiceOrb, type OrbState } from "./VoiceOrb";

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
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = session?.id ?? null;

  const pendingActions = useMemo(
    () => actions.filter((a) => a.status === "proposed"),
    [actions]
  );
  const settledActions = useMemo(
    () => actions.filter((a) => a.status !== "proposed"),
    [actions]
  );

  const orbState: OrbState = thinking
    ? "thinking"
    : pendingActions.length > 0
      ? "awaiting-approval"
      : listening
        ? "listening"
        : "idle";

  const refresh = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    try {
      const data = await jsonFetch(`/api/sessions/${id}`);
      setMessages(data.messages);
      setActions(data.actions);
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

  // "/" focuses the command box from anywhere.
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
      await refreshWith(data.session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed.");
      setCommand(cmd);
    } finally {
      setThinking(false);
    }
  }

  async function refreshWith(id: string) {
    const data = await jsonFetch(`/api/sessions/${id}`);
    setMessages(data.messages);
    setActions(data.actions);
  }

  async function mutate(fn: () => Promise<unknown>): Promise<string | null> {
    try {
      await fn();
      await refresh();
      return null;
    } catch (err) {
      await refresh();
      return err instanceof Error ? err.message : "Request failed.";
    }
  }

  const onApprove = (
    id: string,
    opts: { confirmation?: string; payload?: Record<string, unknown> }
  ) =>
    mutate(() =>
      jsonFetch(`/api/actions/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(opts),
      })
    );

  const onVeto = (id: string, reason: string) =>
    mutate(() =>
      jsonFetch(`/api/actions/${id}/veto`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      })
    );

  const onEdit = (id: string, payload: Record<string, unknown>) =>
    mutate(() =>
      jsonFetch(`/api/actions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ payload }),
      })
    );

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(320px,5fr)_minmax(380px,7fr)]">
      {/* Left: command input + session thread */}
      <section className="flex flex-col gap-4">
        <div className="rounded-card border border-ink bg-white/60 p-4 shadow-sm">
          <label
            htmlFor="command"
            className="text-xs font-extrabold uppercase tracking-widest text-ink-soft"
          >
            Command the operator
          </label>
          <textarea
            id="command"
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onFocus={() => setListening(true)}
            onBlur={() => setListening(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(command);
              }
            }}
            placeholder={'Tell cosigno what to do…  (press "/" to focus)'}
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border-0 bg-transparent text-lg font-semibold placeholder:text-ink-soft/50 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-ink-soft">
              Enter to send · Shift+Enter for a new line
            </span>
            <button
              onClick={() => submit(command)}
              disabled={thinking || !command.trim()}
              className="rounded-pill bg-ink px-5 py-2 text-sm font-extrabold text-cream transition-transform active:scale-95 disabled:opacity-40"
            >
              {thinking ? "Planning…" : "Send"}
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-card border border-ink bg-cream-deep px-4 py-3 text-sm font-semibold">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {messages.length === 0 && !thinking && (
            <div className="rounded-card border border-dashed border-line p-5">
              <p className="text-sm font-bold text-ink-soft">Try one of these:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => submit(ex)}
                    className="rounded-pill border border-ink bg-white/60 px-4 py-2 text-sm font-semibold transition-colors hover:bg-cream-deep"
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
                  className="text-xs font-bold text-ink-soft underline underline-offset-2"
                >
                  {reasoningOpen[m.id] ? "hide reasoning" : "operator reasoning"}
                </button>
                {reasoningOpen[m.id] && (
                  <p className="mt-1 max-w-md rounded-card rounded-bl-md border border-line bg-white/60 px-4 py-2.5 text-sm text-ink-soft">
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
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-soft">
            Action cards
          </h2>
          <VoiceOrb state={orbState} />
        </div>

        {actions.length === 0 && (
          <div className="rounded-card border border-dashed border-line p-8 text-center">
            <p className="text-sm font-semibold text-ink-soft">
              Nothing proposed yet. Give the operator a command — every
              consequential step lands here as a card for your signature.
            </p>
          </div>
        )}

        {pendingActions.map((a) => (
          <ActionCard
            key={a.id}
            action={a}
            onApprove={onApprove}
            onVeto={onVeto}
            onEdit={onEdit}
          />
        ))}

        {settledActions.length > 0 && (
          <details className="mt-2" open={pendingActions.length === 0}>
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-ink-soft">
              Resolved ({settledActions.length})
            </summary>
            <div className="mt-3 flex flex-col gap-3">
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
  );
}
