/**
 * "cosigno is doing this right now", as one mark used everywhere.
 *
 * It replaces the rotating spinner. A spinner says *the browser is busy* — it
 * is the same glyph every website shows for every kind of waiting, which makes
 * it the single most generic thing an interface can display. This says
 * something narrower and truer: a signal dot with a ring that widens out of it
 * and clears, once per beat, like a pulse. It carries the brand colour, it
 * never rotates, and it holds still under prefers-reduced-motion.
 *
 * Server-renderable (no state, no effects) so it can sit anywhere.
 */
export function WorkingPip({ size = 8, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute inset-0 rounded-pill bg-signal/60 motion-safe:animate-orb-ring" />
      <span className="relative inline-block h-full w-full rounded-pill bg-signal" />
    </span>
  );
}

/** The pip with a line of text beside it — the standard inline "busy" row. */
export function WorkingLine({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status">
      <WorkingPip />
      <span>{children}</span>
    </span>
  );
}
