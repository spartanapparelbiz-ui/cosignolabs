"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEPTH } from "@/lib/motion";
import { useRichMotion } from "@/lib/useMotionLevel";
import { SIGNAL } from "@/lib/brand";

/**
 * THE 3D LAYER.
 *
 * cosigno's third dimension is a stack of paper on a desk, lit from above —
 * not objects floating in space. That constraint is the whole design: every
 * 3D surface here is a real card the user is already looking at, given
 * perspective and separation so the eye can tell which layer is on top. It
 * rules out the drifting cubes and glass blobs that make products look like
 * screensavers, and it means the depth is always describing something true
 * (this card is above that one; this one is the live one).
 *
 * Three rules the code enforces rather than documents:
 *  1. Nothing tilts unless the pointer is over it. No idle 3D drift.
 *  2. Nothing tilts at all on a modest device or under reduced motion — the
 *     flat version is the real design, and depth is the enhancement.
 *  3. Transform only, on a rAF, with will-change lifted for the duration of
 *     the interaction and dropped afterwards, so a page of these doesn't
 *     permanently pin a dozen compositor layers.
 */

/**
 * A surface that leans toward the pointer. Renders a plain element with no
 * transform until the pointer actually enters it.
 */
export function Tilt3D({
  children,
  className = "",
  maxTilt = DEPTH.maxTiltDeg,
  lift = 0,
}: {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  /** px the whole surface rises while hovered (translateZ). */
  lift?: number;
}) {
  const rich = useRichMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const [active, setActive] = useState(false);

  const apply = useCallback(
    (rx: number, ry: number, z: number) => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `perspective(${DEPTH.perspective}px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(${z}px)`;
    },
    []
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!rich || e.pointerType !== "mouse") return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // -1..1 from the centre of the surface.
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() =>
        apply(-py * 2 * maxTilt, px * 2 * maxTilt, lift)
      );
    },
    [rich, maxTilt, lift, apply]
  );

  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setActive(false);
    apply(0, 0, 0);
  }, [apply]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      ref={ref}
      onPointerEnter={(e) => e.pointerType === "mouse" && rich && setActive(true)}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={{
        transformStyle: "preserve-3d",
        willChange: active ? "transform" : undefined,
        transition: active ? "none" : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      className={className}
    >
      {children}
    </div>
  );
}

/**
 * A child that sits above its parent surface. Only meaningful inside a
 * Tilt3D (or any preserve-3d parent) — elsewhere it renders flat, which is
 * the correct fallback rather than a bug.
 */
export function DepthLayer({
  z = DEPTH.layerLift,
  className = "",
  children,
}: {
  z?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const rich = useRichMotion();
  return (
    <div
      className={className}
      style={rich ? { transform: `translateZ(${z}px)`, transformStyle: "preserve-3d" } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * THE BRANDED 3D OBJECT — a small stack of signed cards in perspective.
 *
 * This is the one figurative 3D shape cosigno owns, and it is used in exactly
 * the places where the product needs to say what it is without a paragraph:
 * the empty workspace, the account header, a completed mission. It is the
 * product's own metaphor rendered in space — work arrives as cards, and one
 * of them carries your signature.
 *
 * Pure CSS transforms on four small elements. No canvas, no 3D library, no
 * texture downloads: it costs a few hundred bytes and one compositor layer,
 * which is the only reason it is allowed to exist on a first paint at all.
 */
export function SignatureStack({
  size = 132,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const rich = useRichMotion();
  return (
    <div
      className={className}
      style={{ width: size, height: size, perspective: `${DEPTH.perspective}px` }}
      aria-hidden="true"
    >
      <div
        className={rich ? "animate-desk-settle" : undefined}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transform: "rotateX(52deg) rotateZ(-32deg)",
        }}
      >
        {/* the desk shadow the stack sits in */}
        <span
          style={{
            position: "absolute",
            inset: "18% 14% 14% 18%",
            borderRadius: 14,
            background: "rgb(var(--c-ink) / 0.12)",
            filter: "blur(10px)",
            transform: "translateZ(-14px)",
          }}
        />
        {/* three sheets, separated in Z so the eye reads a stack */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              inset: `${12 + i * 3}% ${16 - i * 2}% ${16 - i * 2}% ${12 + i * 3}%`,
              borderRadius: 12,
              background: "rgb(var(--c-surface))",
              boxShadow: "0 1px 0 rgb(var(--c-line))",
              border: "1px solid rgb(var(--c-line))",
              transform: `translateZ(${i * 9}px)`,
            }}
          />
        ))}
        {/* the signature: the brand check, drawn on the top sheet */}
        <svg
          viewBox="0 0 24 24"
          style={{
            position: "absolute",
            left: "34%",
            top: "34%",
            width: "34%",
            height: "34%",
            transform: `translateZ(${3 * 9 + 2}px)`,
            overflow: "visible",
          }}
        >
          <path
            d="M4.5 12.5 10 18 20 6.5"
            fill="none"
            stroke={SIGNAL}
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            className={rich ? "animate-logo-draw" : undefined}
          />
        </svg>
      </div>
    </div>
  );
}
