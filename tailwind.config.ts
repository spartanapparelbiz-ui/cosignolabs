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
        ink: "#141414",
        cream: "#FBF4EA",
        "cream-deep": "#F3E9DA",
        signal: "#FF4B1F",
        "ink-soft": "#5C5650",
        line: "#E4D9C8",
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
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
      },
      transitionTimingFunction: {
        "brand-out": "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        fast: "160ms",
        base: "220ms",
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
          "0%": { boxShadow: "0 0 0 0 rgba(255,75,31,0)" },
          "30%": { boxShadow: "0 0 0 2px rgba(255,75,31,0.9)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255,75,31,0)" },
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
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
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
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,75,31,0)" },
          "50%": { boxShadow: "0 0 0 5px rgba(255,75,31,0.30)" },
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
        settle: "settle 500ms cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 6s ease-in-out infinite",
        "rise-in": "rise-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "word-in": "word-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "ring-flash": "ring-flash 600ms ease-out both",
        "chip-pulse": "chip-pulse 480ms ease-in-out",
        "shake-x": "shake-x 220ms ease-in-out",
        "modal-in": "modal-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "fade-through": "fade-through 120ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
