"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ActionRecord, SignatureRecord } from "@/lib/types";
import { effectLine } from "@/lib/actionPresentation";
import { CosignoMark } from "@/components/brand/Logo";

/**
 * Cosigno Sign — the authorization surface. The background dims, the action
 * card moves into focus, the user sees exactly what will happen, and then
 * draws (or holds to apply) their signature. On completion the signature
 * seals onto the card:  AWAITING SIGNATURE → SIGNED → Executing… →
 * Completed ✓ — fast (~1–2s), precise, no confetti.
 *
 * The drawn signature is the human interaction. The server writes the
 * hashed authorization record (user, action, exact payload, timestamp,
 * method) into the audit trail — that record is the proof.
 */

import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

type Phase = "review" | "sealing" | "executing" | "completed" | "error";

interface Props {
  action: ActionRecord;
  saved: SignatureRecord | null;
  /** Display name fallback when no saved signature exists yet. */
  defaultName: string;
  /**
   * Bundle scope: when one signature authorizes several related actions,
   * EVERY summary is listed here — nothing is ever hidden inside a bundle.
   */
  scope?: string[];
  /** Runs the real approval (confirmation + signature) — returns error or null. */
  onAuthorize(signature: { name: string; image?: string }): Promise<string | null>;
  /** Persist the signature for Hold to Sign next time (best effort). */
  onSaveSignature(name: string, image: string): Promise<void>;
  onClose(done: boolean): void;
}

function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function SignDialog({ action, saved, defaultName, scope, onAuthorize, onSaveSignature, onClose }: Props) {
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("review");
  const [inked, setInked] = useState(false);
  const [name, setName] = useState(saved?.name ?? defaultName);
  const [remember, setRemember] = useState(!saved);
  const [drawInstead, setDrawInstead] = useState(!saved);
  const [error, setError] = useState<string | null>(null);
  const [sealedImage, setSealedImage] = useState<string | null>(null);
  const [authorizedAt, setAuthorizedAt] = useState<string>("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  // Escape closes while reviewing; never mid-seal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase === "review") onClose(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  const runAuthorization = useCallback(
    async (image: string | undefined, signedName: string) => {
      setSealedImage(image ?? null);
      setAuthorizedAt(timeNow());
      setPhase("sealing");
      // Let the seal animation land before the network round-trip.
      await new Promise((r) => setTimeout(r, 750));
      setPhase("executing");
      const err = await onAuthorize({ name: signedName, image });
      if (err) {
        setError(err);
        setPhase("error");
        return;
      }
      if (remember && image && !saved) {
        onSaveSignature(signedName, image).catch(() => null);
      }
      setPhase("completed");
      setTimeout(() => onClose(true), 900);
    },
    [onAuthorize, onClose, onSaveSignature, remember, saved]
  );

  const signDrawn = useCallback(() => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty() || !name.trim()) return;
    runAuthorization(pad.toDataUrl(), name.trim());
  }, [name, runAuthorization]);

  /* Hold to Sign — press and hold ~1s to apply the saved signature. */
  const startHold = useCallback(() => {
    if (!saved) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      runAuthorization(saved.image, saved.name);
    }, 950);
  }, [runAuthorization, saved]);

  const cancelHold = useCallback(() => {
    setHolding(false);
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const sealing = phase === "sealing" || phase === "executing" || phase === "completed";

  // Portal to <body>: ancestor transforms (card entrance animations) would
  // otherwise turn position:fixed into position:inside-the-card.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="sign to authorize"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase === "review") onClose(false);
      }}
    >
      <div
        className={`w-full max-w-lg animate-spring-in rounded-card bg-surface p-6 shadow-depth-lift ${
          phase === "sealing" ? "animate-sig-seal" : ""
        }`}
      >
        {/* status line */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
            {phase === "review" && "Awaiting signature"}
            {phase === "sealing" && "Signed"}
            {phase === "executing" && "Executing…"}
            {phase === "completed" && "Completed"}
            {phase === "error" && "Not executed"}
          </p>
          {phase === "review" && (
            <button
              onClick={() => onClose(false)}
              className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
              aria-label="close without signing"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* exactly what will happen */}
        {scope && scope.length > 1 ? (
          <>
            <h2 className="mt-3 text-lg font-extrabold leading-snug">
              Authorize {scope.length} actions together
            </h2>
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-auto rounded-btn bg-cream-deep px-3 py-2">
              {scope.map((s) => (
                <li key={s} className="flex gap-2 text-sm font-semibold">
                  <span className="text-ink-soft">•</span>
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] font-semibold text-ink-soft">
              One signature authorizes exactly these {scope.length} actions, once each — every
              one gets its own authorization record in your audit trail.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-3 text-lg font-extrabold leading-snug">{action.summary}</h2>
            <p className="mt-1 text-sm text-ink-soft">{effectLine(action)}</p>
            <p className="mt-2 text-[11px] font-semibold text-ink-soft">
              Signing authorizes exactly this action, once. It is recorded in your audit trail.
            </p>
          </>
        )}

        {/* ---------- review: draw or hold ---------- */}
        {phase === "review" && (
          <div className="mt-4">
            {saved && !drawInstead ? (
              <div>
                <div className="relative overflow-hidden rounded-btn bg-cream px-6 py-4 shadow-well">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={saved.image}
                    alt={`saved signature of ${saved.name}`}
                    className={`mx-auto h-20 object-contain ${holding ? "animate-sig-reveal" : "opacity-40"}`}
                  />
                  <div className="mx-6 border-b border-ink/25" aria-hidden="true" />
                </div>
                <button
                  onPointerDown={startHold}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  className="relative mt-3 w-full overflow-hidden rounded-btn bg-ink px-5 py-3 text-sm font-extrabold text-cream"
                >
                  {/* hold progress fill */}
                  <span
                    className="absolute inset-y-0 left-0 bg-signal/85 transition-[width] ease-linear"
                    style={{ width: holding ? "100%" : "0%", transitionDuration: holding ? "950ms" : "150ms" }}
                    aria-hidden="true"
                  />
                  <span className="relative">{holding ? "Keep holding…" : "Hold to Sign"}</span>
                </button>
                <button
                  onClick={() => setDrawInstead(true)}
                  className="mt-2 w-full text-center text-xs font-bold text-ink-soft hover:text-ink"
                >
                  draw it fresh instead
                </button>
              </div>
            ) : (
              <div>
                <SignaturePad ref={padRef} onInk={() => setInked(true)} />
                <div className="mt-3 flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-bold text-ink-soft">
                    <span className="shrink-0">Signed by</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      className="min-w-0 flex-1 rounded-btn bg-cream-deep px-3 py-1.5 text-sm font-semibold text-ink"
                      aria-label="your name for the signature record"
                    />
                  </label>
                  <button
                    onClick={() => {
                      padRef.current?.clear();
                      setInked(false);
                    }}
                    className="shrink-0 rounded-btn px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-cream-deep"
                  >
                    clear
                  </button>
                </div>
                {!saved && (
                  <label className="mt-2 flex items-start gap-2 text-[11px] font-semibold text-ink-soft">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="mt-0.5 accent-[#FF4B1F]"
                    />
                    <span>
                      Save my signature for one-press signing. It represents your approval inside
                      cosigno — not a legally binding e-signature.
                    </span>
                  </label>
                )}
                <button
                  onClick={signDrawn}
                  disabled={!inked || !name.trim()}
                  className="mt-3 w-full rounded-btn bg-signal px-5 py-3 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-[0.99] disabled:opacity-40"
                >
                  Sign to authorize
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---------- sealed: the signature draws onto the card ---------- */}
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
                <p className="animate-sig-reveal text-center font-display text-2xl italic">{name}</p>
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
                <p className="text-sm font-extrabold">Signed by {saved && !sealedImage ? saved.name : name}</p>
                <p className="text-xs text-ink-soft">Authorized through Cosigno · {authorizedAt}</p>
              </div>
              <div className="text-right text-xs font-bold text-ink-soft" aria-live="polite">
                {phase === "executing" && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-orb-pulse rounded-full bg-signal" aria-hidden="true" />
                    Executing…
                  </span>
                )}
                {phase === "completed" && <span className="text-signal">Completed ✓</span>}
              </div>
            </div>
          </div>
        )}

        {/* ---------- error: honest, nothing ran ---------- */}
        {phase === "error" && (
          <div className="mt-4">
            <p className="rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
              {error} — nothing was executed.
            </p>
            <button
              onClick={() => {
                setError(null);
                setPhase("review");
              }}
              className="mt-3 rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep"
            >
              try again
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
