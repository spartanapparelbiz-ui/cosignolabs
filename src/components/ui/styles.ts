/**
 * The workspace's shared surfaces, in class-string form.
 *
 * These exist so a button in Approvals and a button in Connections are the
 * same button. Every control in /app comes from here; a page that needs a
 * shape this file doesn't have should add it here rather than invent one
 * locally, because a one-off is how a design system stops being one.
 *
 * They are strings rather than components on purpose — the call sites already
 * carry their own handlers, refs and aria, and swapping a className is a much
 * smaller change than swapping an element.
 */

/* ------------------------------------------------------------------ */
/* buttons                                                             */
/* ------------------------------------------------------------------ */

/**
 * Four intents, and each one is a claim about the action:
 *
 *   primary   the single thing this screen is for
 *   secondary a real alternative, sitting quietly beside it
 *   ghost     navigation and reversible fiddling
 *   sign      authorization — the one action that wears the brand orange
 *   danger    something that destroys or cannot be taken back
 *
 * A screen has at most one primary. If two things look primary, neither is.
 */
export type ButtonIntent = "primary" | "secondary" | "ghost" | "sign" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex select-none items-center justify-center gap-1.5 rounded-btn font-semibold " +
  "transition-[transform,background-color,color,box-shadow,opacity] duration-fast ease-brand-out " +
  "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none";

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-[32px] px-3 text-[0.8125rem]",
  md: "min-h-[38px] px-4 text-[0.875rem]",
  lg: "min-h-[46px] px-6 text-[0.9375rem]",
};

const BUTTON_INTENT: Record<ButtonIntent, string> = {
  primary: "bg-ink text-cream shadow-rest hover:shadow-raise",
  secondary: "bg-surface text-ink shadow-hairline hover:bg-cream-deep/60",
  ghost: "text-ink-soft hover:bg-ink/[0.055] hover:text-ink",
  sign: "bg-signal text-ink shadow-rest hover:shadow-raise",
  danger: "text-danger shadow-hairline hover:bg-danger/[0.08]",
};

export function btn(intent: ButtonIntent = "secondary", size: ButtonSize = "md", extra = ""): string {
  return [BUTTON_BASE, BUTTON_SIZE[size], BUTTON_INTENT[intent], extra].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* surfaces                                                            */
/* ------------------------------------------------------------------ */

/**
 * A card is a surface, not a container with a wall around it. No border: a
 * hairline and the smallest shadow that still separates it from the page.
 * `interactive` adds the lift — use it only where the whole card is a target,
 * because a surface that rises under the cursor and then does nothing is a lie.
 */
export function card(interactive = false): string {
  return [
    "rounded-card bg-surface shadow-rest",
    interactive &&
      "transition-[box-shadow,transform] duration-base ease-brand-out hover:-translate-y-px hover:shadow-raise",
  ]
    .filter(Boolean)
    .join(" ");
}

/** A grouped region that reads as one thing without becoming a box in a box. */
export const inset = "rounded-card bg-cream-deep/40";

/** The hairline between two stacked rows. Never a full border. */
export const hairline = "border-t border-line/50";

/* ------------------------------------------------------------------ */
/* fields                                                              */
/* ------------------------------------------------------------------ */

export function field(size: "sm" | "md" | "lg" = "md"): string {
  const h = size === "sm" ? "min-h-[32px] px-3 py-1.5 text-[0.8125rem]" : size === "lg" ? "min-h-[52px] px-4 py-3 text-base" : "min-h-[38px] px-3.5 py-2 text-[0.875rem]";
  return (
    "w-full rounded-btn bg-surface text-ink shadow-hairline transition-shadow duration-fast " +
    "placeholder:text-ink-soft/60 focus-visible:outline-none " +
    "focus-visible:shadow-[0_0_0_1px_rgb(var(--c-signal)),0_0_0_4px_rgb(var(--c-signal)/0.16)] " +
    h
  );
}

/* ------------------------------------------------------------------ */
/* badges                                                              */
/* ------------------------------------------------------------------ */

/**
 * A badge states a fact about the row it sits on. It is small, it is quiet,
 * and it never fills with color — color here is a dot or the text itself,
 * because a solid block of orange next to a solid block of green is a traffic
 * light, not an interface.
 */
export type BadgeTone = "neutral" | "positive" | "signal" | "danger";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "text-ink-soft",
  positive: "text-positive",
  signal: "text-signal",
  danger: "text-danger",
};

export function badge(tone: BadgeTone = "neutral"): string {
  return (
    "inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-ink/[0.04] px-2 py-0.5 " +
    "text-[0.6875rem] font-semibold " +
    BADGE_TONE[tone]
  );
}

/** The 5px status dot that carries a badge's meaning without a colored block. */
const DOT_TONE: Record<BadgeTone, string> = {
  neutral: "bg-ink-soft/60",
  positive: "bg-positive",
  signal: "bg-signal",
  danger: "bg-danger",
};

export function dot(tone: BadgeTone = "neutral"): string {
  return `h-[5px] w-[5px] shrink-0 rounded-pill ${DOT_TONE[tone]}`;
}

/* ------------------------------------------------------------------ */
/* rows                                                                */
/* ------------------------------------------------------------------ */

/** A list row that can be clicked. The hover is a tint, never a border. */
export const row =
  "group flex items-center gap-3 rounded-btn px-3 py-2.5 transition-colors duration-fast hover:bg-ink/[0.035]";
