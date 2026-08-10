"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PenLine, X } from "lucide-react";
import type { ActionRecord, SignatureRecord } from "@/lib/types";
import { effectLine } from "@/lib/actionPresentation";
import { CosignoMark } from "@/components/brand/Logo";

/**
 * Cosigno Sign — the authorization surface.
 *
 * The background dims, the action moves into focus, the user sees exactly
 * what will happen, and then approves it. On completion the card seals:
 * AWAITING YOUR APPROVAL → AUTHORIZED → Executing… → Completed ✓ — fast
 * (~1–2s), precise, no confetti.
 *
 * SIGNING IS OPTIONAL, and this dialog has to make that unmistakable.
 * Approve is one press, always available, and the signature sits beside it
 * as an offer rather than a toll gate. It used to be the only way through:
 * the authorize button stayed disabled until you had drawn something with a
 * mouse, which is a fine ceremony once and an obstacle every day after.
 * Nothing about the authorization record changes either way — the server
 * writes the same hashed proof (user, action, exact payload, timestamp,
 * method) whether the method is `approved` or `signed`. The drawing is the
 * flourish; the record is the proof.
 *
 * The ONE thing that still asks for a deliberate keystroke is a tier-3
 * action — a delete, a refund, a payment. Those are irreversible, the
 * product promises typed confirmation for them in writing, and the promise
 * was previously being kept by the client filling the word in on the user's
 * behalf. Now the user types it. It is one word, and it is the only friction
 * left in the flow.
 */

import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { btn, field } from "@/components/ui/styles";

type Phase = "review" | "sealing" | "executing" | "completed" | "error";

/** What one press of Approve sends. Both halves are optional by design. */
export interface Authorization {
  /** Present only when the user chose to sign. */
  signature?: { name: string; image?: string };
  /** The word an irreversible action asks the user to type. */
  confirmation?: string;
}

interface Props {
  action: ActionRecord;
  saved: SignatureRecord | null;
  /** Display name fallback when no saved signature exists yet. */
  defaultName: string;
  /**
   * Bundle scope: when one approval covers several related actions, EVERY
   * summary is listed here — nothing is ever hidden inside a bundle.
   */
  scope?: string[];
  /** Runs the real approval — returns an error message, or null on success. */
  onAuthorize(auth: Authorization): Promise<string | null>;
  /** Persist the signature for one-press signing next time (best effort). */
  onSaveSignature(name: string, image: string): Promise<void>;
  onClose(done: boolean): void;
}

function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function SignDialog({
  action,
  saved,
  defaultName,
  scope,
  onAuthorize,
  onSaveSignature,
  onClose,
}: Props) {
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("review");
  const [inked, setInked] = useState(false);
  const [name, setName] = useState(saved?.name ?? defaultName);
  const [remember, setRemember] = useState(!saved);
  /** The signature panel is closed until asked for. Approve never needs it. */
  const [signOpen, setSignOpen] = useState(false);
  const [drawInstead, setDrawInstead] = useState(!saved);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sealedImage, setSealedImage] = useState<string | null>(null);
  const [signedName, setSignedName] = useState<string | null>(null);
  const [authorizedAt, setAuthorizedAt] = useState<string>("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  /**
   * Irreversible work asks for one typed word. Everything else is a press.
   * Matched case-insensitively and trimmed: this is a deliberateness check,
   * not a spelling test.
   */
  // The word shown is the word the server checks — the engine's own refusal
  // quotes the category verbatim, so showing anything prettier here would
  // teach the user to type something that fails.
  const confirmWord = action.tier === 3 ? action.category : null;
  const confirmed = useMemo(
    () => !confirmWord || typed.trim().toLowerCase() === confirmWord.toLowerCase(),
    [confirmWord, typed]
  );

  // Escape closes while reviewing; never mid-seal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase === "review") onClose(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const runAuthorization = useCallback(
    async (signature?: { name: string; image?: string }) => {
      setSealedImage(signature?.image ?? null);
      setSignedName(signature?.name ?? null);
      setAuthorizedAt(timeNow());
      setPhase("sealing");
      // Let the seal animation land before the network round-trip.
      await new Promise((r) => setTimeout(r, signature ? 750 : 320));
      setPhase("executing");
      const err = await onAuthorize({
        signature,
        confirmation: confirmWord ? action.category : undefined,
      });
      if (err) {
        setError(err);
        setPhase("error");
        return;
      }
      if (remember && signature?.image && !saved) {
        onSaveSignature(signature.name, signature.image).catch(() => null);
      }
      setPhase("completed");
      setTimeout(() => onClose(true), 900);
    },
    [action.category, confirmWord, onAuthorize, onClose, onSaveSignature, remember, saved]
  );

  /** The plain path: approve, no drawing, no ceremony. */
  const approvePlain = useCallback(() => {
    if (!confirmed) return;
    runAuthorization(undefined);
  }, [confirmed, runAuthorization]);

  const signDrawn = useCallback(() => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty() || !name.trim() || !confirmed) return;
    runAuthorization({ name: name.trim(), image: pad.toDataUrl() });
  }, [confirmed, name, runAuthorization]);

  /* Hold to sign — press and hold ~1s to apply the saved signature. */
  const startHold = useCallback(() => {
    if (!saved || !confirmed) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      runAuthorization({ name: saved.name, image: saved.image });
    }, 950);
  }, [confirmed, runAuthorization, saved]);

  const cancelHold = useCallback(() => {
    setHolding(false);
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const sealing = phase === "sealing" || phase === "executing" || phase === "completed";
  const bundled = Boolean(scope && scope.length > 1);

  // Portal to <body>: ancestor transforms (card entrance animations) would
  // otherwise turn position:fixed into position:inside-the-card.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="approve this action"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase === "review") onClose(false);
      }}
    >
      <div
        className={`surface-scroll max-h-[92dvh] w-full max-w-lg animate-spring-in overflow-y-auto rounded-card bg-surface p-6 shadow-raise ${
          phase === "sealing" ? "animate-sig-seal" : ""
        }`}
      >
        {/* status line */}
        <div className="flex items-center justify-between">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            {phase === "review" && "Awaiting your approval"}
            {phase === "sealing" && (sealedImage ? "Signed" : "Authorized")}
            {phase === "executing" && "Executing…"}
            {phase === "completed" && "Completed"}
            {phase === "error" && "Not executed"}
          </p>
          {phase === "review" && (
            <button
              onClick={() => onClose(false)}
              className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
              aria-label="close without approving"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* exactly what will happen */}
        {bundled ? (
          <>
            <h2 className="t-title mt-4 text-[1.0625rem]">
              Approve {scope!.length} actions together
            </h2>
            <ul className="surface-scroll mt-3 flex max-h-40 flex-col gap-1.5 overflow-auto">
              {scope!.map((s) => (
                <li key={s} className="t-body">
                  {s}
                </li>
              ))}
            </ul>
            <p className="t-caption mt-3">
              One approval covers exactly these {scope!.length} actions, once each. Each gets its
              own record in your audit trail.
            </p>
          </>
        ) : (
          <>
            <h2 className="t-title mt-4 text-[1.0625rem]">{action.summary}</h2>
            <p className="t-body mt-1.5 text-ink-soft">{effectLine(action)}</p>
            <p className="t-caption mt-3">
              This authorizes exactly this action, once. It is recorded in your audit trail.
            </p>
          </>
        )}

        {/* ---------- review ---------- */}
        {phase === "review" && (
          <div className="mt-5">
            {/* Irreversible work: one typed word, and the reason it's asked for. */}
            {confirmWord && (
              <div className="mb-5">
                {/* The effect line above already says it can't be undone. This
                    asks for the word and nothing else — saying "this can't be
                    undone" a second time is noise, not emphasis. */}
                <label className="block border-l-2 border-signal pl-3.5">
                  <span className="t-body">
                    Type{" "}
                    <code className="rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[0.9375rem] text-ink">
                      {confirmWord}
                    </code>{" "}
                    to confirm.
                  </span>
                  <input
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && confirmed) approvePlain();
                    }}
                    placeholder={confirmWord}
                    className={`${field("md")} mt-1.5`}
                    aria-label={`type ${confirmWord} to confirm`}
                  />
                </label>
              </div>
            )}

            {/* The way through. One press. */}
            <button
              onClick={approvePlain}
              disabled={!confirmed}
              className={btn("sign", "lg", "w-full")}
            >
              {bundled ? `Approve ${scope!.length} actions` : "Approve"}
            </button>

            {/* …and the offer, stated as an offer. */}
            {!signOpen ? (
              <div className="mt-4 text-center">
                <p className="t-caption">
                  Signing is optional. It adds your signature to the receipt — nothing else
                  changes.
                </p>
                <button
                  onClick={() => setSignOpen(true)}
                  className={btn("ghost", "sm", "mt-1.5")}
                >
                  <PenLine size={13} strokeWidth={1.9} aria-hidden="true" />
                  {saved ? "Sign it instead" : "Add my signature"}
                </button>
              </div>
            ) : (
              <div className="mt-5 animate-fade-through border-t border-line/50 pt-5">
                <p className="t-caption mb-3">Optional — your signature on the receipt.</p>
                {saved && !drawInstead ? (
                  <div>
                    <div className="relative overflow-hidden rounded-btn bg-cream px-6 py-4 shadow-well">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={saved.image}
                        alt={`saved signature of ${saved.name}`}
                        className={`mx-auto h-20 object-contain ${
                          holding ? "animate-sig-reveal" : "opacity-40"
                        }`}
                      />
                      <div className="mx-6 border-b border-ink/25" aria-hidden="true" />
                    </div>
                    <button
                      onPointerDown={startHold}
                      onPointerUp={cancelHold}
                      onPointerLeave={cancelHold}
                      disabled={!confirmed}
                      className="relative mt-4 w-full overflow-hidden rounded-btn bg-ink px-5 py-3 text-[1rem] font-semibold text-cream disabled:pointer-events-none disabled:bg-ink/[0.07] disabled:text-ink-soft"
                    >
                      {/* hold progress fill */}
                      <span
                        className="absolute inset-y-0 left-0 bg-signal/85 transition-[width] ease-linear"
                        style={{
                          width: holding ? "100%" : "0%",
                          transitionDuration: holding ? "950ms" : "150ms",
                        }}
                        aria-hidden="true"
                      />
                      <span className="relative">{holding ? "Keep holding…" : "Hold to sign"}</span>
                    </button>
                    <button
                      onClick={() => setDrawInstead(true)}
                      className="t-caption mt-3 w-full text-center transition-colors duration-fast hover:text-ink"
                    >
                      Draw it fresh instead
                    </button>
                  </div>
                ) : (
                  <div>
                    <SignaturePad ref={padRef} onInk={() => setInked(true)} />
                    <div className="mt-3 flex items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="t-caption shrink-0">Signed by</span>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={80}
                          className={field("sm")}
                          aria-label="your name for the signature record"
                        />
                      </label>
                      <button
                        onClick={() => {
                          padRef.current?.clear();
                          setInked(false);
                        }}
                        className={btn("ghost", "sm", "shrink-0")}
                      >
                        Clear
                      </button>
                    </div>
                    {!saved && (
                      <label className="t-caption mt-3 flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="mt-0.5 accent-[#FB4C20]"
                        />
                        <span>
                          Save my signature for one-press signing. It represents your approval
                          inside cosigno — not a legally binding e-signature.
                        </span>
                      </label>
                    )}
                    <button
                      onClick={signDrawn}
                      disabled={!inked || !name.trim() || !confirmed}
                      className={btn("primary", "md", "mt-4 w-full")}
                    >
                      Approve with my signature
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------- sealed: the authorization lands on the card ---------- */}
        {sealing && (
          <div className="mt-4">
            <div className="relative rounded-btn bg-cream px-6 pb-3 pt-4 shadow-well">
              {sealedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sealedImage}
                  alt="your signature"
                  className="mx-auto h-20 animate-sig-reveal object-contain"
                />
              ) : (
                <p className="animate-sig-reveal py-5 text-center text-[0.9375rem] font-semibold">
                  Authorized by you
                </p>
              )}
              <div
                className="mx-2 origin-left animate-sig-underline border-b-2 border-ink"
                aria-hidden="true"
              />
              <span className="absolute bottom-2.5 right-3 opacity-70" aria-hidden="true">
                <CosignoMark size={16} />
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {signedName ? `Signed by ${signedName}` : "Approved"}
                </p>
                <p className="text-xs text-ink-soft">Authorized through Cosigno · {authorizedAt}</p>
              </div>
              <div className="text-right text-xs font-semibold text-ink-soft" aria-live="polite">
                {phase === "executing" && (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 animate-orb-pulse rounded-pill bg-signal"
                      aria-hidden="true"
                    />
                    Executing…
                  </span>
                )}
                {phase === "completed" && <span className="text-signal-ink">Completed ✓</span>}
              </div>
            </div>
          </div>
        )}

        {/* ---------- error: honest, nothing ran ---------- */}
        {phase === "error" && (
          <div className="mt-4">
            <p className="t-body border-l-2 border-danger pl-3.5 text-danger" role="alert">
              {error} — nothing was executed.
            </p>
            <button
              onClick={() => {
                setError(null);
                setPhase("review");
              }}
              className={btn("secondary", "md", "mt-4")}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
