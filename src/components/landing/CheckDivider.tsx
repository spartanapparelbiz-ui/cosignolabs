import { SIGNAL } from "@/lib/brand";

/**
 * A faint, oversized brand check used as a section divider — the signature
 * motif carried through the page as quiet watermark geometry rather than a
 * hard rule. Purely decorative (aria-hidden), no layout cost beyond a thin
 * band. The stroke is the same tick as the logo mark and the mini-bullets.
 */
export function CheckDivider() {
  return (
    <div className="pointer-events-none flex justify-center py-2" aria-hidden="true">
      <svg width="120" height="34" viewBox="0 0 120 34" fill="none">
        <line x1="0" y1="17" x2="42" y2="17" stroke={SIGNAL} strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M52 18 L58 25 L70 9"
          stroke={SIGNAL}
          strokeOpacity="0.4"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="80" y1="17" x2="120" y2="17" stroke={SIGNAL} strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
