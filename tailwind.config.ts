import type { Config } from "tailwindcss";

/**
 * cosigno design tokens — the single source of truth (see BRAND.md).
 * No ad-hoc hex values in components: colors, radii, shadows and motion
 * all come from here (SVG marks use src/lib/brand.ts, which mirrors
 * these values).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme tokens resolve to CSS variables (RGB channel triplets, so the
        // /opacity modifiers still work) — see globals.css for the light and
        // dark values. "ink" is always the foreground, "cream" the surface;
        // dark mode swaps their brightness, so components need no dark: prefixes.
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        cream: "rgb(var(--c-cream) / <alpha-value>)",
        "cream-deep": "rgb(var(--c-cream-deep) / <alpha-value>)",
        signal: "rgb(var(--c-signal) / <alpha-value>)",
        "on-signal": "rgb(var(--c-on-signal) / <alpha-value>)",
        "ink-soft": "rgb(var(--c-ink-soft) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        // Raised card surface (was literal white); themed so cards read in dark.
        surface: "rgb(var(--c-surface) / <alpha-value>)",
      },
      borderRadius: {
        card: "14px",
        btn: "10px",
        pill: "999px",
      },
      boxShadow: {
        soft: "0 2px 16px rgba(20, 20, 20, 0.06)",
        lift: "0 10px 32px rgba(20, 20, 20, 0.10)",
        // Layered card depth: a 1px inset top highlight over two stacked
        // ambient shadows — reads as a physical, lifted surface.
        depth:
          "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(20,20,20,0.05), 0 8px 24px rgba(20,20,20,0.09)",
        "depth-lift":
          "inset 0 1px 0 rgba(255,255,255,0.75), 0 2px 4px rgba(20,20,20,0.06), 0 16px 40px rgba(20,20,20,0.13)",
        // Recessed payload well — content sits *inside* the card.
        well: "inset 0 2px 5px rgba(20,20,20,0.10), inset 0 0 0 1px rgba(20,20,20,0.04)",
        // --- the elevation ladder -------------------------------------
        // One continuous scale, not a bag of one-off shadows: e1 is a
        // resting tile, e2 a card you can pick up, e3 a card mid-lift, e4
        // an overlay above the page. Every step keeps the same 1px inset
        // top highlight so a surface reads as the same material at every
        // height, and each blur is roughly double the last so the ladder
        // is legible without any of it looking heavy.
        e1: "inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 2px rgba(20,20,20,0.04), 0 2px 8px rgba(20,20,20,0.05)",
        e2: "inset 0 1px 0 rgba(255,255,255,0.65), 0 1px 3px rgba(20,20,20,0.05), 0 6px 18px rgba(20,20,20,0.07)",
        e3: "inset 0 1px 0 rgba(255,255,255,0.72), 0 2px 6px rgba(20,20,20,0.06), 0 14px 34px rgba(20,20,20,0.11)",
        e4: "inset 0 1px 0 rgba(255,255,255,0.78), 0 4px 10px rgba(20,20,20,0.08), 0 28px 64px rgba(20,20,20,0.16)",
        // A hairline ring in the theme's own line colour — the alternative
        // to a border on surfaces that must not shift by 1px on hover.
        hairline: "0 0 0 1px rgb(var(--c-line) / 0.7)",
        // The one sanctioned glow: an approval surface asking for a look.
        // Orange, low alpha, no spread creep.
        "signal-glow": "0 0 0 1px rgb(var(--c-signal) / 0.35), 0 8px 28px rgb(var(--c-signal) / 0.16)",
      },
      backdropBlur: {
        glass: "14px",
      },
      fontFamily: {
        // Four voices, wired in src/app/layout.tsx. `mono` is declared here on
        // purpose: the product sets every payload, id and timestamp in it, and
        // leaving it to Tailwind's default stack meant the audit trail rendered
        // in a different typeface on every operating system.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // The display ladder. Tailwind's default sizes carry a line-height
        // tuned for body copy, which leaves a 40px serif headline looking
        // airy and a 14px label looking cramped. These four pair each size
        // with the leading and tracking it actually wants, so a heading is
        // one token instead of a size + a leading + a tracking guessed per
        // component.
        "display-xl": ["clamp(2.5rem, 6vw, 4rem)", { lineHeight: "1.04", letterSpacing: "-0.022em" }],
        "display-lg": ["clamp(2rem, 4.5vw, 2.75rem)", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        "display-md": ["clamp(1.5rem, 3vw, 1.875rem)", { lineHeight: "1.16", letterSpacing: "-0.015em" }],
        "display-sm": ["1.25rem", { lineHeight: "1.24", letterSpacing: "-0.01em" }],
        // The one label size the product uses for section eyebrows.
        eyebrow: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.1em" }],
      },
      transitionTimingFunction: {
        "brand-out": "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        fast: "160ms",
        base: "220ms",
        entrance: "320ms",
        slow: "500ms",
      },
      keyframes: {
        settle: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(-4px)" },
          "50%": { transform: "translateY(4px)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "word-in": {
          "0%": { opacity: "0", transform: "translateY(0.3em)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "spring-in": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "70%": { transform: "translateY(-3px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ring-flash": {
          "0%": { boxShadow: "0 0 0 0 rgba(251, 76, 32,0)" },
          "30%": { boxShadow: "0 0 0 2px rgba(251, 76, 32,0.9)" },
          "100%": { boxShadow: "0 0 0 0 rgba(251, 76, 32,0)" },
        },
        "chip-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.06)" },
        },
        "shake-x": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "75%": { transform: "translateX(4px)" },
        },
        "orb-spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "orb-spin-rev": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(-360deg)" },
        },
        "orb-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.1)" },
        },
        "modal-in": {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "fade-through": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "card-in": {
          "0%": { opacity: "0", transform: "translateY(14px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "check-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.25)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "check-draw": {
          "0%": { "stroke-dashoffset": "24" },
          "100%": { "stroke-dashoffset": "0" },
        },
        "orb-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.12)", opacity: "0.85" },
        },
        "orb-think": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "orb-ring": {
          "0%": { transform: "scale(0.7)", opacity: "0.55" },
          "70%": { opacity: "0" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
        // --- checkout card choreography ---
        "card-float": {
          "0%, 100%": { transform: "translateY(-4px)" },
          "50%": { transform: "translateY(4px)" },
        },
        "card-sweep": {
          "0%": { transform: "translateX(-120%) skewX(-18deg)", opacity: "0" },
          "12%": { opacity: "0.55" },
          "30%, 100%": { transform: "translateX(220%) skewX(-18deg)", opacity: "0" },
        },
        "cvc-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(1.35)", opacity: "1" },
        },
        "reader-scan": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "coin-flip": {
          "0%": { transform: "rotateY(90deg)", opacity: "0" },
          "60%": { transform: "rotateY(-12deg)", opacity: "1" },
          "100%": { transform: "rotateY(0deg)", opacity: "1" },
        },
        "confetti-fall": {
          "0%": { transform: "translate(0,0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translate(var(--dx), var(--dy)) rotate(var(--dr))", opacity: "0" },
        },
        // Attention pulse that does NOT move the element (box-shadow only), so
        // continuously-pulsing CTAs stay layout-stable.
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(251, 76, 32,0)" },
          "50%": { boxShadow: "0 0 0 5px rgba(251, 76, 32,0.30)" },
        },
        shimmer: {
          "0%": { opacity: "0.5" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0.5" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // --- living logo: the one idle "breath" (see LOGO_BREATH in motion.ts).
        // Scale on the mark; opacity on the check. Compositor-only.
        "logo-breath": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.015)" },
        },
        "logo-check": {
          "0%, 100%": { opacity: "0.92" },
          "50%": { opacity: "1" },
        },
        // --- LogoStatus: the mark as the live status indicator ---
        // A short highlight segment travels the C's arc (normalized via
        // pathLength=1); speed is overridden per state with animationDuration.
        "logo-travel": {
          "0%": { "stroke-dashoffset": "1" },
          "100%": { "stroke-dashoffset": "-1" },
        },
        // Decisive check stroke-draw on execution (pathLength=1 space).
        "logo-draw": {
          "0%": { "stroke-dashoffset": "1" },
          "100%": { "stroke-dashoffset": "0" },
        },
        // --- cosigno sign choreography (premium, fast, no confetti) ---
        // The drawn signature reveals itself left-to-right (saved-signature
        // replay), the thin line travels underneath, and the card settles.
        "sig-reveal": {
          "0%": { "clip-path": "inset(0 100% 0 0)" },
          "100%": { "clip-path": "inset(0 0 0 0)" },
        },
        "sig-underline": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "sig-seal": {
          "0%": { transform: "scale(1.015)" },
          "60%": { transform: "scale(0.997)" },
          "100%": { transform: "scale(1)" },
        },
        // --- the handshake: responsibility physically transfers ---
        // Work arrives from cosigno's side (left), and after authorization
        // it returns to cosigno (slides right, fades). Meaningful motion
        // only — both are quick and settle immediately.
        "handoff-in": {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "handoff-return": {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(22px)" },
        },

        /* ------------------------------------------------------------ *
         * The operator surface: motion for a workspace that is alive.
         * Every one of these is transform/opacity/filter only, so they
         * composite on the GPU and never trigger layout.
         * ------------------------------------------------------------ */

        // Panels and tiles arriving: a shorter, calmer rise than rise-in,
        // meant to be staggered across a grid rather than used alone.
        "tile-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.985)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Content resolving out of a blur — the "it was being computed"
        // feeling, used when real data replaces a skeleton.
        "blur-in": {
          "0%": { opacity: "0", filter: "blur(6px)", transform: "translateY(4px)" },
          "100%": { opacity: "1", filter: "blur(0)", transform: "translateY(0)" },
        },
        // A new line landing in the operator feed: it slides from the side
        // the timeline flows from, so the feed reads as a stream.
        "feed-in": {
          "0%": { opacity: "0", transform: "translateX(-10px)" },
          "60%": { opacity: "1" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        // Determinate progress growing to a width the component sets via
        // --p. Transform-based, so a bar filling never reflows its row.
        "bar-grow": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(var(--p, 1))" },
        },
        // Indeterminate progress: a segment travelling the track. Used only
        // where the real duration is genuinely unknown.
        "bar-travel": {
          "0%": { transform: "translateX(-100%) scaleX(0.4)" },
          "50%": { transform: "translateX(30%) scaleX(0.75)" },
          "100%": { transform: "translateX(220%) scaleX(0.4)" },
        },
        // The step currently executing: a soft breath on its marker.
        "step-live": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.35)" },
        },
        // A light sweep across a surface that just changed — the flash of
        // "this is the thing that updated", without moving anything.
        sheen: {
          "0%": { transform: "translateX(-140%) skewX(-16deg)", opacity: "0" },
          "15%": { opacity: "0.5" },
          "100%": { transform: "translateX(240%) skewX(-16deg)", opacity: "0" },
        },
        // The nav's selected indicator growing into place on route change.
        "rail-mark": {
          "0%": { transform: "scaleY(0.2)", opacity: "0" },
          "100%": { transform: "scaleY(1)", opacity: "1" },
        },
        // Popovers, menus and autocomplete panels: a short spring from the
        // edge they are anchored to.
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(-6px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Skeletons: a travelling highlight rather than a flat opacity
        // pulse, so loading reads as work in progress.
        "skeleton-wave": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        // A live status dot's halo. Box-shadow only — layout-stable.
        "status-ping": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--c-signal) / 0.45)" },
          "70%": { boxShadow: "0 0 0 6px rgb(var(--c-signal) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--c-signal) / 0)" },
        },
      },
      animation: {
        "card-in": "card-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "spring-in": "spring-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "check-pop": "check-pop 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "check-draw": "check-draw 360ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both",
        "orb-pulse": "orb-pulse 1.4s ease-in-out infinite",
        "orb-think": "orb-think 1.2s linear infinite",
        "orb-spin-slow": "orb-spin-slow 14s linear infinite",
        "orb-spin-rev": "orb-spin-rev 18s linear infinite",
        "orb-breathe": "orb-breathe 2.6s ease-in-out infinite",
        "orb-ring": "orb-ring 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "pulse-glow": "pulse-glow 1.6s ease-in-out infinite",
        "card-float": "card-float 6s ease-in-out infinite",
        "card-sweep": "card-sweep 8s ease-in-out infinite",
        "cvc-dot": "cvc-dot 1.2s ease-in-out infinite",
        "reader-scan": "reader-scan 1s ease-in-out infinite",
        "coin-flip": "coin-flip 520ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "confetti-fall": "confetti-fall 900ms cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "toast-in": "toast-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "logo-breath": "logo-breath 5s ease-in-out infinite",
        "logo-check": "logo-check 5s ease-in-out infinite",
        "logo-travel": "logo-travel 2.4s linear infinite",
        "logo-draw": "logo-draw 360ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "sig-reveal": "sig-reveal 700ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "sig-underline": "sig-underline 450ms cubic-bezier(0.22, 1, 0.36, 1) 250ms both",
        "sig-seal": "sig-seal 380ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "handoff-in": "handoff-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "handoff-return": "handoff-return 380ms cubic-bezier(0.22, 1, 0.36, 1) both",
        settle: "settle 500ms cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 6s ease-in-out infinite",
        "rise-in": "rise-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "word-in": "word-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "ring-flash": "ring-flash 600ms ease-out both",
        "chip-pulse": "chip-pulse 480ms ease-in-out",
        "shake-x": "shake-x 220ms ease-in-out",
        "modal-in": "modal-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "fade-through": "fade-through 180ms cubic-bezier(0.22, 1, 0.36, 1) both",

        /* --- the operator surface (see the matching keyframes above) --- */
        "tile-in": "tile-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "blur-in": "blur-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "feed-in": "feed-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "bar-grow": "bar-grow 500ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "bar-travel": "bar-travel 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite",
        "step-live": "step-live 1.6s ease-in-out infinite",
        sheen: "sheen 1.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "rail-mark": "rail-mark 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "pop-in": "pop-in 160ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "skeleton-wave": "skeleton-wave 1.5s cubic-bezier(0.65, 0, 0.35, 1) infinite",
        "status-ping": "status-ping 2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
