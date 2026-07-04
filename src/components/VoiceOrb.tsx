"use client";

export type OrbState = "idle" | "listening" | "thinking" | "awaiting-approval";

const LABELS: Record<OrbState, string> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  "awaiting-approval": "awaiting your approval",
};

/**
 * The voice orb: cosigno's status heartbeat. Four states —
 * idle (still ink dot), listening (soft bars), thinking (rotating arc),
 * awaiting-approval (orange pulse — the signature moment: the operator is
 * holding a pen out to you).
 */
export function VoiceOrb({ state }: { state: OrbState }) {
  return (
    <div
      className="flex items-center gap-2.5"
      role="status"
      aria-label={`Operator status: ${LABELS[state]}`}
    >
      <div className="relative flex h-9 w-9 items-center justify-center">
        {state === "idle" && (
          <span className="h-3.5 w-3.5 rounded-full bg-ink transition-all" />
        )}

        {state === "listening" && (
          <span className="flex h-5 items-end gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-ink"
                style={{
                  height: "100%",
                  transformOrigin: "bottom",
                  animation: `orb-listen 1s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </span>
        )}

        {state === "thinking" && (
          <svg
            width="26"
            height="26"
            viewBox="0 0 26 26"
            className="animate-orb-think"
            fill="none"
          >
            <circle cx="13" cy="13" r="10" stroke="#E4D9C8" strokeWidth="3" />
            <path
              d="M13 3a10 10 0 0 1 9.4 6.6"
              stroke="#141414"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}

        {state === "awaiting-approval" && (
          <>
            <span className="absolute inset-0 animate-orb-pulse rounded-full bg-accent/25" />
            <span className="relative flex h-6 w-6 animate-orb-pulse items-center justify-center rounded-full bg-accent">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4.5 12.5 10 18 20 6.5"
                  stroke="#FBF4EA"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </>
        )}
      </div>
      <span className="hidden text-xs font-bold uppercase tracking-widest text-ink-soft sm:block">
        {LABELS[state]}
      </span>
    </div>
  );
}
