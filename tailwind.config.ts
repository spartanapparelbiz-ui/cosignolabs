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
        // Scale on the wrapper; opacity on the mark itself. Compositor-only.
        "logo-breath": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.015)" },
        },
        "logo-glow": {
          "0%, 100%": { opacity: "0.92" },
          "50%": { opacity: "1" },
        },
        // --- LogoStatus: the mark as the live status indicator ---
        // A short highlight segment travels the mark's band (normalized via
        // pathLength=1); speed is overridden per state with animationDuration.
        "logo-travel": {
          "0%": { "stroke-dashoffset": "1" },
          "100%": { "stroke-dashoffset": "-1" },
        },
        // Decisive stroke-draw on execution (pathLength=1 space).
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
        "logo-glow": "logo-glow 5s ease-in-out infinite",
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
      },
    },
  },
  plugins: [],
};

export default config;
