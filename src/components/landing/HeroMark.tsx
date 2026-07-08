"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { Check, Lock } from "lucide-react";
import { useBreathing } from "@/lib/useBreathing";

/**
 * The hero composed scene: the 3D mark anchored center, with four real
 * action cards floating around it at different depths. Two motions, both
 * compositor-only (transform/opacity) and driven by a single coalesced rAF:
 *   - parallax: on scroll each card drifts by its depth factor (far cards
 *     move less and sit more blurred — a depth-of-field field)
 *   - pointer tilt: on a fine pointer the whole scene tilts up to 3° toward
 *     the cursor, giving the stack physical parallax
 * Under prefers-reduced-motion (or coarse/touch pointers) no listeners are
 * attached and the scene is a still, legible composition. The mark itself is
 * a plain <img> with a fixed 1200×352 ratio, so LCP and CLS are unaffected.
 */

type FloatCard = {
  tier: 1 | 2 | 3;
  label: string;
  summary: string;
  state: "executed" | "awaiting" | "locked";
  /** absolute inset position (inline, so no JIT class dependency) */
  pos: React.CSSProperties;
  /** depth: 0 = front (sharp, slow drift), 1 = far (blurred, fast drift) */
  depth: number;
  delay: number;
};

const CARDS: FloatCard[] = [
  {
    tier: 1,
    label: "auto",
    summary: "archived 24 newsletters",
    state: "executed",
    pos: { left: 0, top: "3%" },
    depth: 0.15,
    delay: 120,
  },
  {
    tier: 2,
    label: "approve",
    summary: "draft replies to 3 leads",
    state: "awaiting",
    pos: { right: 0, top: "16%" },
    depth: 0.45,
    delay: 260,
  },
  {
    tier: 3,
    label: "locked",
    summary: "refund $48.00 · order #2231",
    state: "locked",
    pos: { left: 0, bottom: "10%" },
    depth: 0.7,
    delay: 400,
  },
  {
    tier: 1,
    label: "auto",
    summary: "repriced 12 products",
    state: "executed",
    pos: { right: 0, bottom: "3%" },
    depth: 0.95,
    delay: 540,
  },
];

const TIER_DOT: Record<1 | 2 | 3, string> = {
  1: "bg-line",
  2: "bg-signal",
  3: "bg-ink",
};

export function HeroMark() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  // The hero mark joins the living-logo coordinator: it breathes only while
  // it's the topmost mark on screen (the nav lockup wins until you scroll).
  const { ref: breathRef, active: breathing } = useBreathing<HTMLDivElement>();

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !window.matchMedia?.("(pointer: fine)").matches
    ) {
      return;
    }

    if (!sceneRef.current || !cardsRef.current || !tiltRef.current) return;
    const scene = sceneRef.current;
    const cards = cardsRef.current;
    // The tilt lives on an inner layer: the outer scene runs animate-settle,
    // whose fill-mode would otherwise clobber an inline transform here.
    const tilt = tiltRef.current;

    let tiltX = 0;
    let tiltY = 0;
    let scrollAt = window.scrollY;
    let raf = 0;

    const nodes = Array.from(
      cards.querySelectorAll<HTMLElement>("[data-depth]")
    ).map((el) => ({ el, depth: Number(el.dataset.depth) }));

    function render() {
      raf = 0;
      tilt.style.transform = `rotateX(${tiltY}deg) rotateY(${tiltX}deg)`;
      for (const { el, depth } of nodes) {
        // Subtle, bounded parallax: zero at the top of the page (so cards sit
        // exactly on their CSS rest positions) and drifts a little as you
        // scroll — far cards (higher depth) drift more. Capped so the scene
        // never wanders out of frame.
        const drift = Math.max(-36, Math.min(36, scrollAt * depth * 0.07));
        el.style.transform = `translate3d(0, ${drift.toFixed(2)}px, 0)`;
      }
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(render);
    }

    function onScroll() {
      scrollAt = window.scrollY;
      schedule();
    }
    function onPointer(e: PointerEvent) {
      const r = scene.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tiltX = Math.max(-3, Math.min(3, px * 6));
      tiltY = Math.max(-3, Math.min(3, -py * 6));
      schedule();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    scene.addEventListener("pointermove", onPointer);
    render();

    return () => {
      window.removeEventListener("scroll", onScroll);
      scene.removeEventListener("pointermove", onPointer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={sceneRef}
      className="animate-settle relative mx-auto h-[360px] w-full max-w-[400px] [perspective:900px] sm:h-[420px] sm:max-w-[440px]"
    >
      {/* tilt layer — pointer parallax lives here, off the settling parent */}
      <div
        ref={tiltRef}
        className="relative flex h-full w-full items-center justify-center [transform-style:preserve-3d]"
      >
        {/* soft radial bed behind the mark for depth */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[12%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,75,31,0.08) 0%, rgba(255,75,31,0) 68%)",
          }}
        />

        {/* the mark — the LCP element, anchored center. Float is its constant
            drift; the living-logo breath layers a subtle scale on top when the
            coordinator hands it the breath. */}
        <div className="motion-safe:animate-float w-[44%]">
          <div
            ref={breathRef}
            className={`[transform-origin:center] ${breathing ? "animate-logo-breath" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/icon-3d.png"
              alt="cosigno"
              width={512}
              height={512}
              fetchPriority="high"
              decoding="async"
              className="h-auto w-full select-none"
              draggable={false}
            />
          </div>
        </div>

        {/* floating action cards */}
        <div ref={cardsRef} aria-hidden="true" className="absolute inset-0">
        {CARDS.map((c, i) => (
          <div
            key={i}
            data-depth={c.depth}
            className={`absolute ${i >= 2 ? "hidden sm:block" : ""}`}
            style={{ ...c.pos, filter: `blur(${(c.depth * 1.6).toFixed(2)}px)` }}
          >
            <div
              className="w-[150px] rounded-btn bg-white/85 p-2.5 shadow-depth backdrop-blur-sm animate-spring-in sm:w-[168px]"
              style={{ animationDelay: `${c.delay}ms`, opacity: 1 - c.depth * 0.22 }}
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${TIER_DOT[c.tier]}`} />
                <span className="text-[9px] font-extrabold lowercase tracking-widest text-ink-soft">
                  tier {c.tier} · {c.label}
                </span>
                {c.tier === 3 && (
                  <span className="tier3-texture ml-auto h-3.5 w-6 rounded-sm" />
                )}
              </div>
              <p className="mt-1.5 text-[11px] font-bold leading-tight text-ink">
                {c.summary}
              </p>
              <div className="mt-1.5 flex items-center gap-1">
                {c.state === "executed" && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-extrabold lowercase text-signal">
                    <Check size={10} strokeWidth={3} /> executed
                  </span>
                )}
                {c.state === "awaiting" && (
                  <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[9px] font-bold lowercase text-ink-soft">
                    awaiting sign-off
                  </span>
                )}
                {c.state === "locked" && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold lowercase text-ink-soft">
                    <Lock size={9} strokeWidth={2.6} /> typed confirm
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
