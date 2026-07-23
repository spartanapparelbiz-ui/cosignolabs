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
                  ? "inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 1px rgba(251, 76, 32,0.35), 0 20px 50px rgba(20,20,20,0.4), 0 0 30px rgba(251, 76, 32,0.18)"
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
                viewBox="0 0 160 160"
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
                  <svg width="26" height="26" viewBox="0 0 160 160" fill="none" className="ml-2 shrink-0">
                    <path d="M 70.5 16.44 C 57.77 18.37, 48.31 22.33, 38.54 29.81 C 21.17 43.11, 11 66.97, 13.93 87.6 C 15.73 100.3, 20.58 111.26, 28.77 121.1 C 36.28 130.12, 45.93 136.74, 57.35 140.71 C 63.74 142.94, 68.73 143.86, 76.25 144.19 C 98.96 145.2, 120.62 134.14, 133.15 115.13 C 136.96 109.34, 137.35 108.43, 137.09 105.75 C 136.93 104.12, 136.53 103.08, 135.73 102.31 C 134.56 101.17, 120.58 94.48, 119.35 94.48 C 117.11 94.48, 115.46 95.92, 112.37 100.55 C 108.24 106.77, 103.78 110.86, 97.8 113.91 C 91.25 117.27, 87.7 118.24, 80.92 118.55 C 71.49 118.99, 63.88 116.93, 56.43 111.95 C 50.48 107.97, 46.21 103.19, 43.25 97.2 C 40.26 91.14, 39.38 87.93, 39.07 81.86 C 38.53 71.6, 42.24 61.96, 49.83 53.95 C 61.7 41.4, 80.68 37.99, 96.16 45.6 C 98.26 46.63, 100.14 47.48, 100.35 47.48 C 100.55 47.48, 103.39 45.56, 106.65 43.22 C 109.91 40.88, 114.7 37.64, 117.3 36.02 C 119.89 34.4, 122.02 32.92, 122.02 32.72 C 122.02 31.8, 113.87 25.97, 109.22 23.56 C 103.29 20.47, 101.83 19.91, 94.72 17.97 C 89.97 16.68, 88.7 16.54, 80.71 16.39 C 75.88 16.3, 71.29 16.32, 70.5 16.44" fill={SIGNAL} />
                    <path d="M 141.25 35.34 C 124.28 41.92, 104.95 55.37, 86.12 73.71 C 82.43 77.3, 79.24 80.24, 79.03 80.24 C 78.82 80.24, 75.74 77.39, 72.2 73.9 C 65.01 66.83, 63.97 66.25, 59.07 66.56 C 56.67 66.71, 55.63 67.04, 54.02 68.17 C 51.22 70.13, 49.65 73.11, 49.63 76.47 C 49.61 79.78, 50.62 81.43, 57.24 88.87 C 59.87 91.83, 64.17 96.82, 66.8 99.97 C 69.43 103.12, 72.14 106.06, 72.82 106.5 C 75.05 107.97, 78.47 108.48, 81.49 107.8 C 84.76 107.07, 85.83 106.06, 99.03 91.16 C 114.24 73.98, 131.81 54.32, 139.69 45.63 C 143.81 41.08, 147.18 37, 147.18 36.56 C 147.18 35.6, 145.72 34.17, 144.77 34.21 C 144.4 34.22, 142.81 34.73, 141.25 35.34" fill={CREAM} fillOpacity="0.9" />
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
