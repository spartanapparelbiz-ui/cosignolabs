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

/* `tap` is the coarse-pointer floor (see globals.css): these heights are right
   under a mouse and too small under a thumb, so on touch every one of them
   grows to 44px without changing how any of it looks on a desktop. */
const BUTTON_BASE =
  "tap inline-flex select-none items-center justify-center gap-1.5 rounded-btn font-semibold " +
  "transition-[transform,background-color,color,box-shadow,opacity] duration-fast ease-brand-out " +
  "active:scale-[0.985] disabled:pointer-events-none disabled:shadow-none";

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-[34px] px-3 text-[0.875rem]",
  md: "min-h-[40px] px-4 text-[0.9375rem]",
  lg: "min-h-[48px] px-6 text-[1rem]",
};

/**
 * Disabled is stated by LOSING the fill, not by fading it. A 30%-opacity ink
 * slab is still a slab: it holds the same visual weight as the live button and
 * pulls the eye to the one thing on the page that cannot be pressed.
 */
const BUTTON_INTENT: Record<ButtonIntent, string> = {
  primary:
    "bg-ink text-cream shadow-rest hover:shadow-raise disabled:bg-ink/[0.07] disabled:text-ink-soft",
  secondary: "bg-surface text-ink shadow-hairline hover:bg-cream-deep/60 disabled:text-ink-soft",
  ghost: "text-ink-soft hover:bg-ink/[0.055] hover:text-ink",
  sign:
    "bg-signal text-on-signal shadow-rest hover:shadow-raise disabled:bg-ink/[0.07] disabled:text-ink-soft",
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
  const h =
    size === "sm"
      ? "min-h-[34px] px-3 py-1.5 text-[0.875rem]"
      : size === "lg"
        ? "min-h-[54px] px-4 py-3 text-[1.0625rem]"
        : "min-h-[40px] px-3.5 py-2 text-[0.9375rem]";
  return (
    "tap w-full rounded-btn bg-surface text-ink shadow-hairline caret-signal transition-shadow duration-fast " +
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
  signal: "text-signal-ink",
  danger: "text-danger",
};

export function badge(tone: BadgeTone = "neutral"): string {
  return (
    "inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-ink/[0.05] px-2 py-[3px] " +
    "text-[0.75rem] font-semibold " +
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
  return `h-1.5 w-1.5 shrink-0 rounded-pill ${DOT_TONE[tone]}`;
}

/* ------------------------------------------------------------------ */
/* rows                                                                */
/* ------------------------------------------------------------------ */

/** A list row that can be clicked. The hover is a tint, never a border. */
export const row =
  "group flex items-center gap-3 rounded-btn px-3 py-2.5 transition-colors duration-fast hover:bg-ink/[0.035]";
