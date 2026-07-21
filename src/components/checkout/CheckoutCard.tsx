"use client";

import { useEffect, useMemo, useState } from "react";
import { CREAM, INK, SIGNAL } from "@/lib/brand";

/**
 * The giant animated Cosigno card — the centerpiece of checkout. Pure CSS 3D
 * (no canvas). It reacts ONLY to safe signals: the cardholder name (our own
 * input), the detected brand, per-field focus/complete states, and last4
 * AFTER Stripe confirms. It NEVER sees, mirrors, or renders raw card digits —
 * the number line is always dots until the confirmed last4 arrives.
 *
 * Motion is transform/opacity only and collapses to static final states under
 * prefers-reduced-motion (globals.css handles the keyframed pieces; the
 * state-driven transforms below carry a motion-safe transition).
 */

export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "unknown"
  | null;
export type CardField = "name" | "number" | "expiry" | "cvc" | null;
export type CardPhase = "idle" | "filling" | "paying" | "success" | "failure";

export interface CardState {
  plan: "pro" | "max";
  name: string;
  focus: CardField;
  /** how many of the four 4-digit groups are filled (0–4) */
  numberGroups: 0 | 1 | 2 | 3 | 4;
  brand: CardBrand;
  expiryComplete: boolean;
  phase: CardPhase;
  /** only ever set from the confirmed PaymentMethod, post-payment */
  last4: string | null;
}

const BRAND_LABEL: Record<Exclude<CardBrand, null>, string> = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
  discover: "DISC",
  unknown: "CARD",
};

/** A tiny brand glyph — stylized text, no trademarked logo assets. */
function BrandGlyph({ brand }: { brand: CardBrand }) {
  if (!brand) return null;
  return (
    <span
      key={brand}
      className="animate-coin-flip rounded-[4px] bg-cream/95 px-2 py-0.5 text-[11px] font-black italic tracking-tight text-ink [transform-style:preserve-3d]"
    >
      {BRAND_LABEL[brand]}
    </span>
  );
}

export function CheckoutCard({ state, scale = 1 }: { state: CardState; scale?: number }) {
  const { plan, name, focus, numberGroups, brand, phase, last4 } = state;
  const flipped = focus === "cvc";
  const isMax = plan === "max";

  // one-time confetti burst on success
  const [burst, setBurst] = useState<number[]>([]);
  useEffect(() => {
    if (phase === "success") setBurst(Array.from({ length: 20 }, (_, i) => i));
    else setBurst([]);
  }, [phase]);

  const inner = useMemo(() => {
    const tilt = focus === "name" ? "rotateX(8deg)" : "rotateX(0deg)";
    const flip = flipped ? "rotateY(180deg)" : "rotateY(0deg)";
    const slide =
      phase === "paying"
        ? "translateY(96px) scale(0.9)"
        : phase === "failure"
          ? "translateY(-34px)"
          : "translateY(0)";
    return `${slide} ${tilt} ${flip}`;
  }, [focus, flipped, phase]);

  // 16 dots in four groups; last group shows last4 on success
  const groups = [0, 1, 2, 3] as const;

  return (
    <div
      className="relative mx-auto w-full max-w-[380px] select-none"
      style={{ transform: `scale(${scale})` }}
      aria-hidden="true"
    >
      {/* float wrapper — idle drift only, off the stateful transform below */}
      <div className={phase === "idle" ? "motion-safe:animate-card-float" : ""}>
        <div className="[perspective:1400px]">
          <div
            className={`relative aspect-[1.586/1] w-full [transform-style:preserve-3d] transition-transform duration-[600ms] ease-brand-out ${
              phase === "failure" ? "animate-shake-x" : ""
            }`}
            style={{ transform: inner }}
          >
            {/* ---------- FRONT ---------- */}
            <div
              className="absolute inset-0 overflow-hidden rounded-[18px] [backface-visibility:hidden]"
              style={{
                background: isMax
                  ? "linear-gradient(145deg,#1c1c1c 0%,#0d0d0d 55%,#161616 100%)"
                  : "linear-gradient(145deg,#232323 0%,#141414 60%,#0e0e0e 100%)",
                boxShadow: isMax
                  ? "inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 1px rgba(255,75,31,0.35), 0 20px 50px rgba(20,20,20,0.4), 0 0 30px rgba(255,75,31,0.18)"
                  : "inset 0 1px 0 rgba(255,255,255,0.12), 0 20px 44px rgba(20,20,20,0.34)",
              }}
            >
              {/* max textured band */}
              {isMax && (
                <div className="tier3-texture pointer-events-none absolute inset-0 opacity-60" />
              )}
              {/* faint oversized brand check across the face */}
              <svg
                className="pointer-events-none absolute -right-6 top-2 h-[130%] w-[80%]"
                viewBox="0 0 100 100"
                fill="none"
              >
                <path
                  d="M 20 55 L 42 78 L 92 18"
                  stroke={SIGNAL}
                  strokeOpacity="0.06"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {/* light sweep */}
              {phase === "idle" && (
                <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent motion-safe:animate-card-sweep" />
              )}

              <div className="relative flex h-full flex-col justify-between p-5">
                {/* top row: wordmark + plan */}
                <div className="flex items-start justify-between">
                  <span className="text-[15px] font-black lowercase tracking-tight text-cream">
                    cos<span className="relative">i<span className="absolute -top-[3px] left-[1px] h-[3px] w-[3px] rounded-full bg-signal" /></span>gno
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-signal">
                    {plan}
                  </span>
                </div>

                {/* brand glyph + chip */}
                <div className="flex items-center gap-3">
                  <span className="h-6 w-8 rounded-[4px] bg-gradient-to-br from-[#d8c48a] to-[#a9884a] shadow-inner" />
                  <span className="min-h-[22px]">
                    <BrandGlyph brand={brand} />
                  </span>
                </div>

                {/* number line */}
                <div className="flex items-center gap-3 font-mono text-cream">
                  {groups.map((g) => {
                    const filled = numberGroups > g;
                    const showLast4 = phase === "success" && g === 3 && last4;
                    return (
                      <span
                        key={g}
                        className={`flex gap-[3px] text-[15px] tracking-widest transition-opacity duration-base ${
                          focus === "number" && numberGroups === g ? "opacity-100" : ""
                        }`}
                      >
                        {showLast4 ? (
                          <span className="tracking-normal">{last4}</span>
                        ) : (
                          [0, 1, 2, 3].map((d) => (
                            <span
                              key={d}
                              className={`h-[7px] w-[7px] rounded-full transition-colors duration-fast ${
                                filled ? "bg-cream" : "bg-cream/25"
                              }`}
                            />
                          ))
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* bottom row: name + expiry + mark */}
                <div className="flex items-end justify-between">
                  <div className="min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-cream/50">
                      cardholder
                    </p>
                    <p
                      className="max-w-[180px] truncate text-[13px] font-bold uppercase tracking-wide"
                      style={{
                        color: CREAM,
                        textShadow: "0 1px 0 rgba(0,0,0,0.4)",
                        minHeight: "16px",
                      }}
                    >
                      {name || " "}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-cream/50">
                      valid thru
                    </p>
                    <p
                      className={`font-mono text-[13px] font-bold transition-colors ${
                        focus === "expiry" ? "text-signal" : state.expiryComplete ? "text-cream" : "text-cream/60"
                      }`}
                    >
                      ••/••
                    </p>
                  </div>
                  {/* embossed C+check mark */}
                  <svg width="26" height="26" viewBox="0 0 100 100" fill="none" className="ml-2 shrink-0">
                    <path d="M 76 66.9 A 31 31 0 1 1 76 33.1" fill="none" stroke={SIGNAL} strokeWidth="14" strokeLinecap="round" />
                    <path d="M 38 51 L 53 65 L 83 29" fill="none" stroke={CREAM} strokeOpacity="0.9" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {/* success stamp */}
              {phase === "success" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="88" height="88" viewBox="0 0 24 24" fill="none" className="animate-check-pop drop-shadow-lg">
                    <circle cx="12" cy="12" r="11" fill={SIGNAL} />
                    <path
                      d="M6.5 12.5 10.5 16.5 17.5 8.5"
                      stroke={INK}
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="24"
                      className="animate-check-draw"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* ---------- BACK ---------- */}
            <div
              className="absolute inset-0 overflow-hidden rounded-[18px] [backface-visibility:hidden] [transform:rotateY(180deg)]"
              style={{
                background: "linear-gradient(145deg,#1e1e1e 0%,#0d0d0d 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 20px 44px rgba(20,20,20,0.34)",
              }}
            >
              <div className="mt-5 h-9 w-full bg-black/80" />
              <div className="mt-4 px-5">
                <div className="flex items-center gap-2">
                  <div className="h-8 flex-1 rounded-[3px] bg-cream/85" />
                  <div className="flex items-center gap-1 rounded-[3px] bg-cream/85 px-2 py-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`h-2.5 w-2.5 rounded-full bg-ink ${
                          flipped ? "motion-safe:animate-cvc-dot" : ""
                        }`}
                        style={{ animationDelay: `${i * 140}ms` }}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-[9px] font-bold uppercase tracking-widest text-cream/40">
                  cvc is entered securely with stripe — never shown here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- card-reader slot ---------- */}
      <div className="mx-auto mt-3 h-4 w-[62%] overflow-hidden rounded-full bg-ink/90 shadow-well">
        {phase === "paying" && (
          <span className="block h-full w-1/3 bg-signal motion-safe:animate-reader-scan" />
        )}
      </div>

      {/* ---------- confetti ---------- */}
      {burst.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {burst.map((i) => {
            const angle = (i / 20) * Math.PI * 2;
            const dist = 90 + (i % 5) * 22;
            const dx = `${Math.cos(angle) * dist}px`;
            const dy = `${Math.sin(angle) * dist - 40}px`;
            const dr = `${(i % 2 ? 1 : -1) * (180 + i * 12)}deg`;
            const orange = i % 2 === 0;
            return (
              <span
                key={i}
                className="absolute motion-safe:animate-confetti-fall motion-reduce:hidden"
                style={
                  {
                    "--dx": dx,
                    "--dy": dy,
                    "--dr": dr,
                    animationDelay: `${(i % 6) * 24}ms`,
                  } as React.CSSProperties
                }
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4.5 12.5 10 18 20 6.5"
                    stroke={orange ? SIGNAL : INK}
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
