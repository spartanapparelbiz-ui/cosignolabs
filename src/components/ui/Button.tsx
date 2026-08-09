"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

/**
 * THE BUTTON.
 *
 * Every consequential control in cosigno is one of these, and the reason it
 * exists as a primitive is that its *states* are the product's honesty
 * surface. A button that looks identical while idle, while sending, and after
 * it failed is a button that lies about what happened — and in a product
 * whose whole promise is "you approve, then it happens", that is the most
 * expensive kind of lie.
 *
 * So all seven states are first-class and none of them is colour-only:
 *
 *   idle · hover · press · focus · disabled · loading · success · error
 *
 * loading gets a spinner AND aria-busy. success gets a check AND a spoken
 * announcement. error gets a warning glyph AND text. Someone using a screen
 * reader, someone with a colour vision deficiency, and someone glancing at it
 * from across a desk all get the same information.
 *
 * The physics: 160ms, ease-out, a 1px rise on hover and a 2% compression on
 * press. Premium and physical, not a children's app — nothing overshoots, and
 * nothing bounces.
 */

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonState = "idle" | "loading" | "success" | "error";

const TONE: Record<ButtonTone, string> = {
  primary:
    "bg-signal text-ink shadow-soft hover:shadow-lift hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
  secondary:
    "bg-ink text-cream shadow-soft hover:shadow-lift hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
  ghost:
    "ring-1 ring-inset ring-ink/25 text-ink hover:bg-cream-deep hover:ring-ink/40 active:scale-[0.98]",
  danger:
    "ring-1 ring-inset ring-ink text-ink hover:bg-ink hover:text-cream active:scale-[0.98]",
};

/**
 * Sizes are floors, not fixed heights: `md` clears the 44px touch target on
 * every phone, and `sm` is only ever allowed where a pointer is guaranteed
 * (dense desktop toolbars) or beside a larger primary that carries the real
 * action.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3 py-1.5 text-xs gap-1.5",
  md: "min-h-[44px] px-4 py-2.5 text-sm gap-2",
  lg: "min-h-[52px] px-6 py-3 text-base gap-2.5",
};

const BASE =
  "inline-flex items-center justify-center rounded-btn font-extrabold " +
  "transition-[transform,box-shadow,background-color,color] duration-fast ease-brand-out " +
  "disabled:cursor-not-allowed disabled:bg-cream-deep disabled:text-ink-soft " +
  "disabled:shadow-none disabled:ring-0 disabled:translate-y-0 disabled:hover:translate-y-0";

/** What the button says while it is doing something, spoken and shown. */
function StateGlyph({ state }: { state: ButtonState }) {
  if (state === "loading")
    return <Loader2 size={15} className="animate-spin" aria-hidden="true" />;
  if (state === "success")
    return <Check size={15} strokeWidth={3} className="animate-check-pop" aria-hidden="true" />;
  if (state === "error")
    return <AlertCircle size={15} strokeWidth={2.6} aria-hidden="true" />;
  return null;
}

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Drives the spinner / check / warning and the spoken announcement. */
  state?: ButtonState;
  /** Convenience for `state="loading"`. */
  loading?: boolean;
  /** Replaces the label while loading — say what is happening, not "please wait". */
  loadingLabel?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    tone = "primary",
    size = "md",
    state = "idle",
    loading = false,
    loadingLabel,
    icon,
    iconRight,
    fullWidth = false,
    className = "",
    disabled,
    children,
    ...rest
  },
  ref
) {
  const resolved: ButtonState = loading ? "loading" : state;
  const busy = resolved === "loading";
  const glyph = <StateGlyph state={resolved} />;

  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      // A busy button stays focusable and keeps its name — disabling it mid-
      // action would throw focus to the top of the document, which is how
      // keyboard users lose their place every time something saves.
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={`${BASE} ${TONE[tone]} ${SIZE[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {glyph ?? icon}
      <span className="truncate">{busy && loadingLabel ? loadingLabel : children}</span>
      {!busy && iconRight}
      {/* The state, for anyone who can't see it. Silent while idle. */}
      <span className="sr-only" role="status" aria-live="polite">
        {resolved === "loading"
          ? loadingLabel ?? "working"
          : resolved === "success"
            ? "done"
            : resolved === "error"
              ? "that didn't work"
              : ""}
      </span>
    </button>
  );
});

/**
 * The same surface as a link. Navigation is not an action — it never shows
 * loading, success or error, because nothing has happened yet.
 */
export function ButtonLink({
  href,
  tone = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth = false,
  className = "",
  prefetch = true,
  children,
  ...rest
}: {
  href: string;
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  prefetch?: boolean;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={`${BASE} ${TONE[tone]} ${SIZE[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
      {iconRight}
    </Link>
  );
}
