"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, PenLine, ShieldAlert, X } from "lucide-react";
import type { ActionRecord, SignatureRecord } from "@/lib/types";
import type { CosignoState } from "@/lib/state";
import { effectLine } from "@/lib/actionPresentation";
import { afterApprovalLine, beforeApprovalLine } from "@/lib/clarity";
import { signRequired } from "@/lib/sign";
import { SignDialog } from "@/components/sign/SignDialog";
import { CosignoMark } from "@/components/brand/Logo";
import { useToast } from "@/components/Toast";
import { useDisplayName } from "@/lib/theme";

/**
 * FOCUS — the handoff. When cosigno reaches the boundary of its authority,
 * the workspace clears and the actual work comes to the user: the real
 * email, the real change — not a generic approval card. The user decides on
 * the work itself (read it, edit it in place), then Approves or Signs, and
 * the work visibly returns to cosigno. One decision at a time; as little
 * interruption as possible.
 */

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

/** Payloads that read as a message get rendered as the actual document. */
function emailFields(payload: Record<string, unknown>) {
  const to = typeof payload.to === "string" ? payload.to : typeof payload.recipient === "string" ? payload.recipient : null;
  const subject = typeof payload.subject === "string" ? payload.subject : null;
  const body = typeof payload.body === "string" ? payload.body : typeof payload.content === "string" ? payload.content : null;
  if (to === null && subject === null && body === null) return null;
  return { to: to ?? "", subject: subject ?? "", body: body ?? "" };
}

type Phase = "review" | "returning";

export function FocusMode() {
  const [queue, setQueue] = useState<ActionRecord[] | null>(null);
  const [saved, setSaved] = useState<SignatureRecord | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("review");
  const [signOpen, setSignOpen] = useState(false);
  const [telling, setTelling] = useState(false);
  const [tellText, setTellText] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [displayName] = useDisplayName();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [a, sig, st] = await Promise.all([
        jsonFetch("/api/actions?status=proposed&limit=100"),
        jsonFetch("/api/signature").catch(() => ({ signature: null })),
        jsonFetch("/api/state").catch(() => ({ state: null })),
      ]);
      setQueue((a.actions ?? []).filter((x: ActionRecord) => x.status === "proposed"));
      setSaved(sig.signature ?? null);
      setNotes(((st.state as CosignoState | null)?.notes ?? []).slice(0, 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your decisions.");
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const action = queue?.[0] ?? null;
  const email = useMemo(() => (action ? emailFields(action.payload) : null), [action]);
  const needsSign = action ? signRequired(action.category, action.tier) : false;

  // Reset per-decision state whenever the front of the queue changes.
  useEffect(() => {
    setPhase("review");
    setEditing(false);
    setTelling(false);
    setTellText("");
    setError(null);
    setDraft(email ? { ...email } : null);
    setJsonDraft(action ? JSON.stringify(action.payload, null, 2) : "");
  }, [action?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The handshake completion: work returns to cosigno, queue advances. */
  const returnToCosigno = useCallback(() => {
    setPhase("returning");
    setTimeout(() => {
      setDoneCount((n) => n + 1);
      setQueue((q) => (q ? q.slice(1) : q));
    }, 420);
  }, []);

  const saveEdits = useCallback(async (): Promise<string | null> => {
    if (!action) return null;
    let payload: Record<string, unknown> | null = null;
    if (email && draft) {
      payload = { ...action.payload };
      if (draft.to) payload.to = draft.to;
      if (draft.subject) payload.subject = draft.subject;
      if (draft.body) payload.body = draft.body;
    } else if (editing) {
      try {
        payload = JSON.parse(jsonDraft);
      } catch {
        return "the payload needs to be valid JSON.";
      }
    }
    if (!payload) return null;
    try {
      await jsonFetch(`/api/actions/${action.id}`, {
        method: "PATCH",
        body: JSON.stringify({ payload }),
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "couldn't save the change.";
    }
  }, [action, draft, editing, email, jsonDraft]);

  const approve = useCallback(
    async (signature?: { name: string; image?: string }): Promise<string | null> => {
      if (!action) return null;
      setBusy(true);
      setError(null);
      const editErr = await saveEdits();
      if (editErr) {
        setBusy(false);
        setError(editErr);
        return editErr;
      }
      try {
        await jsonFetch(`/api/actions/${action.id}/approve`, {
          method: "POST",
          body: JSON.stringify({
            ...(action.tier === 3 && signature ? { confirmation: action.category } : {}),
            ...(signature ? { signature } : {}),
          }),
        });
        toast("success", signature ? "signed — cosigno continues." : "approved — cosigno continues.");
        returnToCosigno();
        return null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "that didn't go through.";
        setError(msg);
        return msg;
      } finally {
        setBusy(false);
      }
    },
    [action, returnToCosigno, saveEdits, toast]
  );

  const tellCosigno = useCallback(async () => {
    if (!action) return;
    setBusy(true);
    try {
      await jsonFetch(`/api/actions/${action.id}/veto`, {
        method: "POST",
        body: JSON.stringify({ reason: tellText.trim() || "declined in focus" }),
      });
      toast("success", "understood — nothing ran, and cosigno logged why.");
      returnToCosigno();
    } catch (e) {
      setError(e instanceof Error ? e.message : "that didn't go through.");
    } finally {
      setBusy(false);
    }
  }, [action, returnToCosigno, tellText, toast]);

  const onSaveSignature = useCallback(async (name: string, image: string) => {
    try {
      const d = await jsonFetch("/api/signature", {
        method: "PUT",
        body: JSON.stringify({ name, image }),
      });
      setSaved(d.signature ?? null);
    } catch {
      /* convenience only */
    }
  }, []);

  /* ---------------------------------------------------------- empty/clear */
  if (queue === null) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16" aria-busy="true">
        <div className="h-64 animate-pulse rounded-card bg-cream-deep" />
      </div>
    );
  }

  if (!action) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center">
        <CosignoMark size={30} />
        <h1 className="mt-4 font-display text-2xl font-bold">
          {doneCount > 0 ? "All clear." : "Nothing needs you."}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          {doneCount > 0
            ? `${doneCount} decision${doneCount === 1 ? "" : "s"} handled — the work is back with cosigno.`
            : "Cosigno keeps working and will bring the next decision to you."}
        </p>
        <Link
          href="/app"
          className="mt-6 rounded-btn bg-ink px-5 py-2.5 text-sm font-bold text-cream"
        >
          Back to your workspace
        </Link>
      </div>
    );
  }

  /* -------------------------------------------------------------- decision */
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      {/* the handoff line: responsibility visually crosses to the user */}
      <div className="flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
        <span className="flex items-center gap-1.5">
          <CosignoMark size={14} /> Cosigno
        </span>
        <span className="relative h-px flex-1 bg-line">
          <span
            className={`absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-signal transition-[left] duration-500 ease-brand-out ${
              phase === "returning" ? "left-0" : "left-[calc(100%-6px)]"
            }`}
            aria-hidden="true"
          />
        </span>
        <span>You</span>
      </div>
      <p className="mt-2 text-sm font-extrabold">
        {phase === "returning" ? "Back with cosigno — continuing." : "I need your decision."}
        {queue.length > 1 && phase === "review" && (
          <span className="ml-2 font-semibold text-ink-soft">
            {queue.length - 1} more after this
          </span>
        )}
      </p>

      <div
        key={action.id + phase}
        className={`mt-4 rounded-card border border-line/70 bg-surface p-6 shadow-depth-lift ${
          phase === "returning" ? "animate-handoff-return" : "animate-handoff-in"
        }`}
      >
        {action.injection_flag && (
          <div className="mb-4 flex items-start gap-1.5 rounded-btn bg-signal/10 px-3 py-2 text-[11px] font-bold lowercase leading-snug text-signal ring-1 ring-inset ring-signal/30">
            <ShieldAlert size={13} strokeWidth={2.5} className="mt-px shrink-0" />
            external content tried to direct this — it can&apos;t be executed. re-issue the
            command yourself if you want it done.
          </div>
        )}

        {/* ---------- the actual work, not a card about it ---------- */}
        {email && draft ? (
          <div className="rounded-btn bg-cream shadow-well">
            <div className="border-b border-line/60 px-4 py-2.5">
              <label className="flex items-baseline gap-2 text-sm">
                <span className="w-14 shrink-0 text-xs font-extrabold uppercase tracking-wide text-ink-soft">To</span>
                <input
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                  aria-label="recipient"
                />
              </label>
            </div>
            <div className="border-b border-line/60 px-4 py-2.5">
              <label className="flex items-baseline gap-2 text-sm">
                <span className="w-14 shrink-0 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Subject</span>
                <input
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent font-extrabold outline-none"
                  aria-label="subject"
                />
              </label>
            </div>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={Math.min(14, Math.max(6, draft.body.split("\n").length + 2))}
              className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed outline-none"
              aria-label="message body"
            />
          </div>
        ) : (
          <div>
            <h1 className="text-lg font-extrabold leading-snug">{action.summary}</h1>
            {!editing ? (
              <dl className="mt-3 flex flex-col gap-1.5 rounded-btn bg-cream px-4 py-3 shadow-well">
                {Object.entries(action.payload).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-3 text-sm">
                    <dt className="w-28 shrink-0 truncate text-xs font-extrabold text-ink-soft">{k}</dt>
                    <dd className="min-w-0 flex-1 break-words font-semibold">
                      {typeof v === "string" ? v : JSON.stringify(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                rows={10}
                className="mt-3 w-full rounded-btn bg-cream p-3 font-mono text-[11px] leading-relaxed shadow-well"
                aria-label="edit the exact payload (JSON)"
              />
            )}
          </div>
        )}

        {/* ---------- what cosigno recommends, and why ---------- */}
        <div className="mt-4 rounded-btn bg-cream-deep px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
            Cosigno recommends
          </p>
          <p className="mt-1 text-sm font-semibold">{effectLine(action)}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {beforeApprovalLine(action.category)} {afterApprovalLine(action.category)}
          </p>
          {notes[0] && <p className="mt-1.5 text-xs text-ink-soft">{notes[0]}</p>}
        </div>

        {error && (
          <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
            {error}
          </p>
        )}

        {/* ---------- ready when you are ---------- */}
        {phase === "review" && (
          <div className="mt-5">
            <p className="text-xs font-bold text-ink-soft">Ready when you are.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!action.injection_flag &&
                (needsSign ? (
                  <button
                    onClick={() => setSignOpen(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream shadow-soft transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    <PenLine size={14} strokeWidth={2.6} /> Sign →
                  </button>
                ) : (
                  <button
                    onClick={() => approve()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    <Check size={14} strokeWidth={3} /> {busy ? "Executing…" : "Approve"}
                  </button>
                ))}
              {!email && (
                <button
                  onClick={() => setEditing((v) => !v)}
                  disabled={busy}
                  className="rounded-btn px-4 py-2.5 text-sm font-bold text-ink-soft transition-colors hover:bg-cream-deep disabled:opacity-50"
                >
                  {editing ? "done changing" : "Change"}
                </button>
              )}
              {!telling ? (
                <button
                  onClick={() => setTelling(true)}
                  disabled={busy}
                  className="rounded-btn px-4 py-2.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep disabled:opacity-50"
                >
                  Tell cosigno
                </button>
              ) : (
                <span className="flex w-full items-center gap-2 sm:w-auto">
                  <input
                    value={tellText}
                    onChange={(e) => setTellText(e.target.value)}
                    placeholder="what should change? (logged, nothing runs)"
                    className="w-64 rounded-btn bg-cream-deep px-3 py-2 text-xs"
                    aria-label="tell cosigno why not"
                  />
                  <button
                    onClick={tellCosigno}
                    disabled={busy}
                    className="rounded-btn bg-ink px-4 py-2 text-xs font-bold text-cream disabled:opacity-50"
                  >
                    send
                  </button>
                  <button
                    onClick={() => setTelling(false)}
                    className="rounded-btn p-1.5 text-ink-soft hover:bg-cream-deep"
                    aria-label="cancel"
                  >
                    <X size={14} />
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {signOpen && (
        <SignDialog
          action={action}
          saved={saved}
          defaultName={displayName.trim() || "Operator"}
          onAuthorize={(sig) => approve(sig)}
          onSaveSignature={onSaveSignature}
          onClose={() => setSignOpen(false)}
        />
      )}
    </div>
  );
}
