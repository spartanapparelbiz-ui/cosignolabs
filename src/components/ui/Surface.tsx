import Link from "next/link";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * The one card in the product.
 *
 * Before this existed, a card was whatever combination of `rounded-card`,
 * `bg-surface/60`, a shadow and a hover translate the file happened to reach
 * for — which is why the same "card" sat at four different heights and lifted
 * by three different amounts across the app. A surface now picks an
 * *elevation* and says whether it is interactive; the material is decided
 * here, once.
 *
 * Rules it enforces:
 *   - transform/opacity only on hover (never a border that shifts layout),
 *   - the hairline is a ring, so a hovered card doesn't resize by 2px,
 *   - the lift collapses under prefers-reduced-motion,
 *   - the entrance is staggered and capped, so a long grid never crawls in.
 */

export type Elevation = "flat" | "resting" | "raised" | "lifted" | "overlay";

const SHADOW: Record<Elevation, string> = {
  flat: "",
  resting: "shadow-e1",
  raised: "shadow-e2",
  lifted: "shadow-e3",
  overlay: "shadow-e4",
};

export interface SurfaceProps {
  children: React.ReactNode;
  /** Resting height. Interactive surfaces gain one step on hover. */
  elevation?: Elevation;
  /** Adds the hover lift + press response. Implied by `href` / `onClick`. */
  interactive?: boolean;
  /** A hairline ring in the theme's line colour, drawn without layout cost. */
  hairline?: boolean;
  /** Stagger position for the entrance animation. Omit for no entrance. */
  index?: number;
  /** Entrance stagger step. Defaults to the tile cadence. */
  step?: number;
  /** Draw the attention treatment: the signal ring + glow. Sparingly. */
  attention?: boolean;
  className?: string;
  /** Renders the surface as a link. */
  href?: string;
  onClick?: () => void;
  /** Accessible label when the surface itself is the control. */
  ariaLabel?: string;
}

export function Surface({
  children,
  elevation = "raised",
  interactive,
  hairline = true,
  index,
  step = STAGGER_MS.tiles,
  attention = false,
  className = "",
  href,
  onClick,
  ariaLabel,
}: SurfaceProps) {
  const clickable = interactive ?? Boolean(href || onClick);

  const classes = [
    "group relative rounded-card bg-surface/80",
    SHADOW[elevation],
    hairline && !attention ? "ring-1 ring-inset ring-line/60" : "",
    attention ? "ring-1 ring-inset ring-signal/40 shadow-signal-glow" : "",
    index !== undefined ? "animate-tile-in" : "",
    clickable
      ? "cursor-pointer text-left transition-[transform,box-shadow,border-color] duration-fast ease-brand-out hover:-translate-y-0.5 hover:shadow-e3 active:translate-y-0 active:scale-[0.995] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
      : "transition-[box-shadow] duration-fast ease-brand-out",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const style = index !== undefined ? staggerDelay(index, step) : undefined;

  if (href) {
    return (
      <Link href={href} prefetch className={classes} style={style} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} style={style} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
