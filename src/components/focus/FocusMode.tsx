"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, PenLine, ShieldAlert, X } from "lucide-react";
import type { ActionRecord, SignatureRecord } from "@/lib/types";
import type { CosignoState } from "@/lib/state";
import { effectLine } from "@/lib/actionPresentation";
import { afterApprovalLine, beforeApprovalLine, whyMe } from "@/lib/clarity";
import { signRequired } from "@/lib/sign";
import dynamic from "next/dynamic";

// The sign dialog (and its signature-pad canvas) loads when the user actually
// signs — it's not part of the focus route's initial chunk.
const SignDialog = dynamic(() =>
  import("@/components/sign/SignDialog").then((m) => m.SignDialog)
);
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
  // FLUID CONTROL: who holds the work right now. Cosigno holds it by
  // default; "I'll take it from here" hands it to the user (artifact
  // becomes editable); "Cosigno, continue" hands it back with the user's
  // changes kept — never restarted, never overwritten.
  const [control, setControl] = useState<"cosigno" | "you">("cosigno");
  // Approval bundle: review every waiting decision together (never hidden —
  // the bundle lists each action, and one signature covers exactly them).
  const [bundleMode, setBundleMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bundleSignOpen, setBundleSignOpen] = useState(false);
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
    setControl("cosigno");
    setTelling(false);
    setTellText("");
    setError(null);
    setDraft(email ? { ...email } : null);
    setJsonDraft(action ? JSON.stringify(action.payload, null, 2) : "");
  }, [action?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bundle selection defaults to every eligible (unflagged) decision.
  useEffect(() => {
    if (queue) setSelected(new Set(queue.filter((a) => !a.injection_flag).map((a) => a.id)));
  }, [queue?.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } else if (control === "you") {
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
  }, [action, control, draft, email, jsonDraft]);

  /* ------------------------- fluid control: takeover + handback ---------- */

  /** I'LL TAKE IT FROM HERE — pause cosigno's side; the artifact is yours. */
  const takeOver = useCallback(() => {
    setControl("you");
  }, []);

  /** COSIGNO, CONTINUE — hand it back with your changes kept, never redone. */
  const handBack = useCallback(async () => {
    setBusy(true);
    const err = await saveEdits();
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setControl("cosigno");
    toast("success", "cosigno continues — your changes are kept.");
  }, [saveEdits, toast]);

  /** FINISH MYSELF — the user keeps the work; the card closes with a logged reason. */
  const finishMyself = useCallback(async () => {
    if (!action) return;
    setBusy(true);
    try {
      await jsonFetch(`/api/actions/${action.id}/veto`, {
        method: "POST",
        body: JSON.stringify({ reason: "took over — finishing this myself" }),
      });
      toast("success", "all yours — cosigno stepped back and logged it.");
      returnToCosigno();
    } catch (e) {
      setError(e instanceof Error ? e.message : "that didn't go through.");
    } finally {
      setBusy(false);
    }
  }, [action, returnToCosigno, toast]);

  /* ------------------------------- approval bundle ----------------------- */

  const bundleActions = (queue ?? []).filter((a) => selected.has(a.id) && !a.injection_flag);
  const bundleNeedsSign = bundleActions.some((a) => signRequired(a.category, a.tier));

  /** Authorize every selected action — one pass, one record each. */
  const authorizeBundle = useCallback(
    async (signature?: { name: string; image?: string }): Promise<string | null> => {
      setBusy(true);
      let failures = 0;
      for (const a of bundleActions) {
        try {
          await jsonFetch(`/api/actions/${a.id}/approve`, {
            method: "POST",
            body: JSON.stringify({
              ...(a.tier === 3 && signature ? { confirmation: a.category } : {}),
              ...(signature ? { signature } : {}),
            }),
          });
        } catch {
          failures += 1;
        }
      }
      setBusy(false);
      setBundleMode(false);
      setDoneCount((n) => n + bundleActions.length - failures);
      await load();
      if (failures > 0) {
        toast("error", `${failures} of ${bundleActions.length} didn't complete — they stay in the queue.`);
        return `${failures} actions didn't complete.`;
      }
      toast("success", `${bundleActions.length} authorized — cosigno continues.`);
      return null;
    },
    [bundleActions, load, toast]
  );

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
      <div className="mx-auto w-full max-w-none px-6 lg:px-10 py-16" aria-busy="true">
        <div className="h-64 animate-pulse rounded-card bg-cream-deep" />
      </div>
    );
  }

  if (!action) {
    return (
      <div className="mx-auto flex w-full max-w-none flex-col items-center px-6 lg:px-10 py-20 text-center">
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
    <div className="mx-auto w-full max-w-none px-6 lg:px-10 py-10">
      {/* THE BOUNDARY: what cosigno can handle │ what only you can authorize.
          The dot is the work — it crosses to your side, and returns after. */}
      <div className="flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
        <span className="flex items-center gap-1.5">
          <CosignoMark size={14} /> Cosigno
        </span>
        <span className="relative h-px flex-1 bg-line">
          <span
            className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-ink/40"
            aria-hidden="true"
          />
          <span
            className="absolute left-1/2 top-2 -translate-x-1/2 text-[8px] font-black tracking-[0.2em] text-ink-soft/70"
            aria-hidden="true"
          >
            BOUNDARY
          </span>
          <span
            className={`absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-pill bg-signal transition-[left] duration-slow ease-brand-out ${
              phase === "returning" ? "left-0" : "left-[calc(100%-6px)]"
            }`}
            aria-hidden="true"
          />
        </span>
        <span>You</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold">
          {phase === "returning" ? "Back with cosigno — continuing." : "I need your decision."}
          {queue.length > 1 && phase === "review" && (
            <span className="ml-2 font-semibold text-ink-soft">
              {queue.length - 1} more after this
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {/* who holds the work right now — quiet, but always answered */}
          <span
            className={`rounded-pill px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
              control === "you" ? "bg-signal/15 text-ink" : "bg-cream-deep text-ink-soft"
            }`}
          >
            {phase === "returning"
              ? "Cosigno continues"
              : control === "you"
                ? "You have control"
                : "Cosigno has control"}
          </span>
          {queue.length > 1 && phase === "review" && control === "cosigno" && (
            <button
              onClick={() => setBundleMode((v) => !v)}
              className="rounded-pill px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-ink-soft ring-1 ring-inset ring-ink/25 hover:bg-cream-deep hover:text-ink"
            >
              {bundleMode ? "One at a time" : `Review all ${queue.length} together`}
            </button>
          )}
        </div>
      </div>

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

        {/* ---------- the actual work, not a card about it ----------
            Editable only while YOU have control — take it from here first. */}
        {email && draft ? (
          <div className={`rounded-btn bg-cream shadow-well ${control === "cosigno" ? "opacity-95" : "ring-1 ring-inset ring-signal/40"}`}>
            <div className="border-b border-line/60 px-4 py-2.5">
              <label className="flex items-baseline gap-2 text-sm">
                <span className="w-14 shrink-0 text-xs font-extrabold uppercase tracking-wide text-ink-soft">To</span>
                <input
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  readOnly={control === "cosigno"}
                  className="min-w-0 flex-1 bg-transparent font-semibold outline-none read-only:cursor-default"
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
                  readOnly={control === "cosigno"}
                  className="min-w-0 flex-1 bg-transparent font-extrabold outline-none read-only:cursor-default"
                  aria-label="subject"
                />
              </label>
            </div>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              readOnly={control === "cosigno"}
              rows={Math.min(14, Math.max(6, draft.body.split("\n").length + 2))}
              className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed outline-none read-only:cursor-default"
              aria-label="message body"
            />
          </div>
        ) : (
          <div>
            <h1 className="text-lg font-extrabold leading-snug">{action.summary}</h1>
            {control === "cosigno" ? (
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
                className="mt-3 w-full rounded-btn bg-cream p-3 font-mono text-[11px] leading-relaxed shadow-well ring-1 ring-inset ring-signal/40"
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
          {/* WHY ME? — the boundary, explained in one honest sentence. */}
          <p className="mt-1.5 text-xs font-semibold text-ink">{whyMe(action)}</p>
          {notes[0] && <p className="mt-1.5 text-xs text-ink-soft">{notes[0]}</p>}
        </div>

        {error && (
          <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
            {error}
          </p>
        )}

        {/* ---------- ready when you are / fluid control ---------- */}
        {phase === "review" && control === "you" ? (
          /* YOU HAVE CONTROL — finish it yourself, or hand it back with
             your changes kept. Cosigno never restarts or overwrites. */
          <div className="mt-5">
            <p className="text-xs font-bold text-ink-soft">
              It&apos;s yours — edit anything above. Cosigno is paused on this one.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={handBack}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-on-signal shadow-soft transition-transform active:scale-[0.98] disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
              >
                {busy ? "Handing back…" : "Cosigno, continue"}
              </button>
              <button
                onClick={finishMyself}
                disabled={busy}
                className="rounded-btn px-4 py-2.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Finish myself
              </button>
            </div>
          </div>
        ) : phase === "review" ? (
          <div className="mt-5">
            <p className="text-xs font-bold text-ink-soft">Ready when you are.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!action.injection_flag &&
                (needsSign ? (
                  <button
                    onClick={() => setSignOpen(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream shadow-soft transition-transform active:scale-[0.98] disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
                  >
                    <PenLine size={14} strokeWidth={2.6} /> Sign →
                  </button>
                ) : (
                  <button
                    onClick={() => approve()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-on-signal shadow-soft transition-transform active:scale-[0.98] disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
                  >
                    <Check size={14} strokeWidth={3} /> {busy ? "Executing…" : "Approve"}
                  </button>
                ))}
              <button
                onClick={takeOver}
                disabled={busy}
                className="rounded-btn px-4 py-2.5 text-sm font-bold text-ink-soft transition-colors hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                I&apos;ll take it from here
              </button>
              {!telling ? (
                <button
                  onClick={() => setTelling(true)}
                  disabled={busy}
                  className="rounded-btn px-4 py-2.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="rounded-btn bg-ink px-4 py-2 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
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
        ) : null}
      </div>

      {/* ---------- the approval bundle: everything waiting, together ---------- */}
      {bundleMode && phase === "review" && control === "cosigno" && (
        <div className="mt-4 rounded-card border border-line/70 bg-surface p-5 shadow-depth">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
            Everything waiting on you
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {queue.map((a) => {
              const disabled = a.injection_flag;
              const checked = selected.has(a.id) && !disabled;
              return (
                <li key={a.id} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(a.id);
                      else next.delete(a.id);
                      setSelected(next);
                    }}
                    className="mt-1 accent-signal"
                    aria-label={`include: ${a.summary}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold leading-snug">{a.summary}</p>
                    <p className="text-[11px] text-ink-soft">
                      {signRequired(a.category, a.tier) ? "requires signature" : "one-click approve"}
                      {disabled && " · held: external content tried to direct it"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => (bundleNeedsSign ? setBundleSignOpen(true) : authorizeBundle())}
              disabled={busy || bundleActions.length === 0}
              className={`inline-flex items-center gap-1.5 rounded-btn px-5 py-2.5 text-sm font-extrabold shadow-soft transition-transform active:scale-[0.98] disabled:opacity-50 ${
                bundleNeedsSign ? "bg-ink text-cream" : "bg-signal text-on-signal"
              }`}
            >
              {bundleNeedsSign ? (
                <>
                  <PenLine size={14} strokeWidth={2.6} /> Sign bundle ({bundleActions.length})
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={3} /> Approve {bundleActions.length}
                </>
              )}
            </button>
            <p className="text-[11px] font-semibold text-ink-soft">
              Exactly the checked actions run — each gets its own authorization record.
            </p>
          </div>
        </div>
      )}

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
      {bundleSignOpen && (
        <SignDialog
          action={bundleActions.find((a) => signRequired(a.category, a.tier)) ?? action}
          saved={saved}
          defaultName={displayName.trim() || "Operator"}
          scope={bundleActions.map((a) => a.summary)}
          onAuthorize={(sig) => authorizeBundle(sig)}
          onSaveSignature={onSaveSignature}
          onClose={() => setBundleSignOpen(false)}
        />
      )}
    </div>
  );
}
