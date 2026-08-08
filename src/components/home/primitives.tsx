"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  animate,
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * Motion primitives for the home page.
 *
 * Two rules shape everything here, both inherited from BRAND.md:
 *
 * 1. **Legibility is never gated on motion.** Server HTML renders every
 *    section fully visible. The hidden "pre-reveal" state is applied only
 *    after hydration, and only to elements that were still below the
 *    viewport at that moment (`useArmed`). No JS, a dead observer, or a
 *    print stylesheet all leave the page readable.
 * 2. **Transform and opacity only.** Nothing here animates a layout
 *    property, so every reveal, parallax and scrub stays on the compositor.
 *
 * `prefers-reduced-motion` collapses all of it: `useArmed` refuses to arm,
 * so elements simply render in their final state.
 */

/** The brand easing curve, as a cubic-bezier array for Framer. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;

/** Durations in seconds, mirroring the DURATION tokens in src/lib/motion.ts. */
export const D = { fast: 0.16, base: 0.22, entrance: 0.32, slow: 0.5, story: 0.72 } as const;

const REDUCED = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(REDUCED).matches === true;
}

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * `prefers-reduced-motion`, read hydration-safely.
 *
 * Framer's own hook settles in an effect, which means a reduced-motion
 * visitor can see one painted frame of the scrubbed state before it corrects.
 * `useSyncExternalStore` gives React the server value (false) for hydration
 * and the real value for the render that follows, so scroll-driven transforms
 * are never applied to someone who asked for stillness.
 */
export function useStillness(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

/**
 * True only when this element was below the fold at mount — the single gate
 * that lets a reveal hide something without ever hiding it from a reader.
 * Returns false forever under reduced motion.
 */
export function useArmed(ref: React.RefObject<HTMLElement | null>): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.92) setArmed(true);
  }, [ref]);
  return armed;
}

/** Fade + rise as the element enters view. Plays once. */
export function Rise({
  children,
  className = "",
  delay = 0,
  y = 20,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  /** seconds */
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const armed = useArmed(ref);
  const inView = useInView(ref, { once, margin: "0px 0px -12% 0px" });
  const hidden = armed && !inView;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? { opacity: 0, y } : { opacity: 1, y: 0 }}
      transition={hidden ? { duration: 0 } : { duration: D.story, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

const STAGGER_PARENT = {
  hidden: { transition: { duration: 0 } },
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 18, transition: { duration: 0 } },
  shown: { opacity: 1, y: 0, transition: { duration: D.story, ease: EASE_OUT } },
};

/** Container whose `<StaggerItem>` descendants reveal in sequence. */
export function Stagger({
  children,
  className = "",
  step = 0.07,
  delay = 0.04,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const armed = useArmed(ref);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const hidden = armed && !inView;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? "hidden" : "shown"}
      variants={{
        ...STAGGER_PARENT,
        shown: { transition: { staggerChildren: step, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={STAGGER_ITEM}>
      {children}
    </motion.div>
  );
}

/**
 * Masked line reveal: each line rides up from behind its own clipping edge.
 * The text is real text in the server HTML — the mask is decoration on top.
 */
export function MaskedLines({
  lines,
  className = "",
  lineClassName = "",
  as: Tag = "h2",
  step = 0.09,
  delay = 0,
  id,
}: {
  lines: string[];
  className?: string;
  lineClassName?: string;
  as?: "h1" | "h2" | "h3" | "p";
  step?: number;
  delay?: number;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const armed = useArmed(ref);
  const inView = useInView(ref, { once: true, margin: "0px 0px -14% 0px" });
  const hidden = armed && !inView;
  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={hidden ? "hidden" : "shown"}
      variants={{
        hidden: { transition: { duration: 0 } },
        shown: { transition: { staggerChildren: step, delayChildren: delay } },
      }}
    >
      <Tag className={className} id={id}>
        {lines.map((line, i) => (
          // The clip box carries the descender padding, then pulls it back so
          // line rhythm is untouched.
          <span
            key={i}
            className={`block overflow-hidden pb-[0.16em] [margin-bottom:-0.16em] ${lineClassName}`}
          >
            <motion.span
              className="block"
              variants={{
                hidden: { y: "105%", opacity: 0, transition: { duration: 0 } },
                shown: {
                  y: "0%",
                  opacity: 1,
                  transition: { duration: 0.78, ease: EASE_OUT },
                },
              }}
            >
              {/* The trailing space matters: without it the block spans
                  concatenate and a screen reader reads "cannotact". */}
              {i < lines.length - 1 ? `${line} ` : line}
            </motion.span>
          </span>
        ))}
      </Tag>
    </motion.div>
  );
}

/**
 * A number that counts up the first time it's seen. Renders its final value
 * in the server HTML and only rewinds once armed, so a reader never meets a
 * zero that means nothing.
 */
export function Counter({
  to,
  from = 0,
  duration = 1.5,
  className = "",
  format = (v: number) => Math.round(v).toLocaleString(),
}: {
  to: number;
  from?: number;
  duration?: number;
  className?: string;
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const armed = useArmed(ref);
  const inView = useInView(ref, { once: true, margin: "0px 0px -18% 0px" });
  const [value, setValue] = useState(to);

  // A countdown from 24 to 0 loses two digits on the way, and the line it sits
  // on reflows every time. Reserve the widest rendering up front; `ch` is the
  // digit advance under tabular figures, so this is exact.
  const widest = Math.max(format(from).length, format(to).length);

  // Rewind to the start only once we know the element is off-screen.
  useEffect(() => {
    if (armed) setValue(from);
  }, [armed, from]);

  useEffect(() => {
    if (!armed || !inView) return;
    const controls = animate(from, to, {
      duration,
      ease: EASE_OUT,
      onUpdate: setValue,
    });
    return () => controls.stop();
  }, [armed, inView, from, to, duration]);

  return (
    <span
      ref={ref}
      className={`inline-block tabular-nums ${className}`}
      style={{ minWidth: `${widest}ch` }}
    >
      {format(value)}
    </span>
  );
}

/**
 * Scroll progress through a section, 0 at the moment its top meets the top of
 * the viewport and 1 when its bottom does — the scrub source for every pinned
 * scene on the page.
 */
export function useSectionProgress(ref: React.RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  return scrollYProgress;
}

/** A lightly damped version of a progress value — takes the jitter out of scrubs. */
export function useSmoothed(value: MotionValue<number>, stiffness = 140, damping = 26) {
  return useSpring(value, { stiffness, damping, restDelta: 0.0005 });
}

/**
 * The hairline at the top of the window that fills as the page is read.
 * Purely decorative, and the one sanctioned "progress fill" use of signal.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 34, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-signal"
    />
  );
}

/**
 * Parallax helper: maps a section's progress onto a vertical offset, with the
 * translation collapsed to zero under reduced motion.
 */
export function useParallax(progress: MotionValue<number>, distance: number) {
  const still = useStillness();
  return useTransform(progress, [0, 1], [0, still ? 0 : distance]);
}
