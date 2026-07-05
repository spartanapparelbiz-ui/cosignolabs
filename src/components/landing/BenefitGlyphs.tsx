"use client";

import { useReveal } from "@/lib/useReveal";
import { CREAM, INK, SIGNAL } from "@/lib/brand";

/**
 * The three benefit glyphs, each playing a small once-on-scroll animation:
 *  - card: an approve check draws into the card
 *  - check: the signal check draws itself
 *  - ledger: rows tick in top-to-bottom
 * Transform/opacity + stroke-dash only. Reduced motion → final state shown.
 */
export function BenefitGlyph({ kind }: { kind: "card" | "check" | "ledger" }) {
  const { ref, shown } = useReveal<HTMLSpanElement>();
  const draw = shown
    ? { strokeDashoffset: 0 }
    : { strokeDashoffset: 26 };

  return (
    <span ref={ref} className="inline-block">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {kind === "card" && (
          <>
            <rect x="3" y="5" width="18" height="14" rx="3" fill={INK} />
            <path
              d="M8 12.2 10.8 15 16 8.6"
              stroke={SIGNAL}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="26"
              style={{ ...draw, transition: "stroke-dashoffset 480ms cubic-bezier(0.22,1,0.36,1) 120ms" }}
            />
          </>
        )}
        {kind === "check" && (
          <>
            <circle cx="12" cy="12" r="10" fill={INK} />
            <path
              d="M7.5 12.5 10.8 16 17 8.5"
              stroke={SIGNAL}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="26"
              style={{ ...draw, transition: "stroke-dashoffset 500ms cubic-bezier(0.22,1,0.36,1) 100ms" }}
            />
          </>
        )}
        {kind === "ledger" && (
          <>
            <rect x="4" y="3" width="16" height="18" rx="2.5" fill={INK} />
            {[8, 12, 16].map((y, i) => (
              <line
                key={y}
                x1="8"
                y1={y}
                x2={y === 16 ? 13 : 16}
                y2={y}
                stroke={CREAM}
                strokeWidth="1.8"
                strokeLinecap="round"
                style={{
                  transformOrigin: "8px center",
                  transform: shown ? "scaleX(1)" : "scaleX(0)",
                  transition: `transform 260ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
                }}
              />
            ))}
          </>
        )}
      </svg>
    </span>
  );
}
