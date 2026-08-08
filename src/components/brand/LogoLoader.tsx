"use client";

import { CosignoMark } from "./Logo";

/**
 * The cosigno loading indicator — never a spinner, never a browser default,
 * never the word "loading".
 *
 * The mark signs itself in: a ghost of the symbol sits underneath, the real
 * mark is revealed left-to-right the way a signature is written, and a bright
 * edge travels with the reveal. That happens ONCE; afterwards the mark simply
 * breathes over a soft orange aura, so a three-second wait and a fifteen-second
 * wait both stay calm instead of escalating into a spinning distraction.
 *
 * Reduced motion is handled by construction, not by a branch: `logo-sign` ends
 * on the complete mark, and globals.css collapses every animation to an instant
 * state change — so the mark renders whole and still.
 *
 * `label` is the contextual message (see lib/loadingMessages.ts). It describes
 * the page actually being opened; it is never a random reassurance.
 */
export function LogoLoader({
  size = 32,
  label,
  className = "",
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center gap-4 ${className}`}
    >
      <SigningMark size={size} />
      {label ? (
        <span className="animate-fade-through text-sm font-semibold text-ink-soft [animation-delay:420ms]">
          {label}
          <Ellipsis />
        </span>
      ) : null}
      <span className="sr-only">{label ?? "working"}</span>
    </div>
  );
}

/**
 * The mark mid-signature. Three stacked layers in one square: the aura, the
 * ghost, and the revealed mark with its travelling edge. Everything is
 * transform/opacity/clip-path on a small box — it composites, and there is
 * exactly one of these on screen at a time.
 */
export function SigningMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex [transform-origin:center] motion-safe:animate-logo-breath"
      style={{ width: size, height: size, animationDelay: "820ms" }}
      aria-hidden="true"
    >
      {/* the soft orange breath behind the mark — the one thing that repeats */}
      <span
        className="pointer-events-none absolute -inset-[35%] rounded-pill bg-signal/45 blur-xl motion-safe:animate-aura-breathe"
        aria-hidden="true"
      />
      {/* the ghost: the shape is legible from the very first frame */}
      <span className="absolute inset-0 opacity-[0.14]">
        <CosignoMark size={size} />
      </span>
      {/* the signature: revealed left-to-right, once */}
      <span className="absolute inset-0 animate-logo-sign">
        <CosignoMark size={size} />
      </span>
      {/* the bright edge that travels with the reveal, then leaves */}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-full overflow-hidden">
        <span className="absolute inset-y-0 left-0 w-[3px] animate-sign-edge rounded-pill bg-signal" />
      </span>
    </span>
  );
}

/**
 * Three dots breathing in sequence. Opacity only, no timers, no state — and it
 * settles to three steady dots under reduced motion, so the sentence still
 * reads as a sentence.
 */
function Ellipsis() {
  return (
    <span aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="motion-safe:animate-shimmer"
          style={{ animationDelay: `${i * 220}ms` }}
        >
          .
        </span>
      ))}
    </span>
  );
}

/**
 * A full-bleed loading moment for a route that has nothing to show yet — the
 * app-launch screen. It fills the shell (the rail, header and footer stay put),
 * so there is no white flash and no layout jump when the real page lands.
 */
export function RouteLoader({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24">
      <LogoLoader size={44} label={message} />
    </div>
  );
}
