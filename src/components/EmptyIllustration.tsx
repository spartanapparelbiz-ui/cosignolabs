import { INK, SIGNAL, INK_SOFT, LINE } from "@/lib/brand";

export type EmptyKind = "workspace" | "activity" | "integrations";

/**
 * Custom flat empty-state illustrations — ink line work with a single orange
 * accent, no people, no stock look. Pure SVG (server-renderable, zero JS),
 * sized to sit above an empty-state message. Each maps to a surface:
 *   workspace    — an action card waiting for a signature
 *   activity     — a ledger of logged rows
 *   integrations — a plug easing into its socket
 * The lone signal stroke is the "one orange accent" the brand allows.
 */
export function EmptyIllustration({
  kind,
  className = "",
}: {
  kind: EmptyKind;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 120"
      width="160"
      height="120"
      fill="none"
      role="img"
      aria-hidden="true"
      className={className}
    >
      {kind === "workspace" && <Workspace />}
      {kind === "activity" && <Activity />}
      {kind === "integrations" && <Integrations />}
    </svg>
  );
}

const stroke = {
  stroke: INK,
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const faint = { stroke: LINE, strokeWidth: 2.4, strokeLinecap: "round" as const };

/** An action card mid-air, its signature line still blank, awaiting a check. */
function Workspace() {
  return (
    <>
      {/* soft ground shadow */}
      <ellipse cx="80" cy="104" rx="42" ry="5" fill={INK_SOFT} opacity="0.12" />
      {/* back card (ghost) */}
      <rect x="42" y="24" width="80" height="58" rx="9" {...faint} fill="none" />
      {/* front card */}
      <rect x="30" y="34" width="82" height="60" rx="10" {...stroke} fill="none" />
      {/* header pill + payload lines */}
      <rect x="42" y="46" width="26" height="7" rx="3.5" fill={INK} opacity="0.85" />
      <line x1="42" y1="63" x2="98" y2="63" {...faint} />
      <line x1="42" y1="73" x2="86" y2="73" {...faint} />
      {/* signature slot — the one orange accent: a drawn check settling in */}
      <circle cx="100" cy="82" r="12" fill={SIGNAL} />
      <path
        d="M94.5 82.5 98.5 86.5 106 78.5"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** A ledger book: ruled rows, each tick a logged event; the newest is orange. */
function Activity() {
  return (
    <>
      <ellipse cx="80" cy="106" rx="46" ry="5" fill={INK_SOFT} opacity="0.12" />
      {/* book cover / page */}
      <rect x="34" y="20" width="92" height="76" rx="8" {...stroke} fill="none" />
      {/* spine binding */}
      <line x1="50" y1="20" x2="50" y2="96" {...faint} />
      {[34, 47, 60, 73].map((y) => (
        <line key={y} x1="58" y1={y} x2="116" y2={y} {...faint} />
      ))}
      {/* row bullets — logged entries */}
      {[34, 47, 60].map((y) => (
        <circle key={y} cx="54" cy={y} r="1.8" fill={INK} />
      ))}
      {/* newest entry: the orange accent tick + check */}
      <circle cx="54" cy="73" r="3" fill={SIGNAL} />
      <path
        d="M104 70.5 107 73.5 113 66.5"
        stroke={SIGNAL}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** A plug approaching its socket — the gap is where a connection would form. */
function Integrations() {
  return (
    <>
      <ellipse cx="80" cy="104" rx="46" ry="5" fill={INK_SOFT} opacity="0.12" />
      {/* socket on the right */}
      <rect x="98" y="40" width="34" height="40" rx="9" {...stroke} fill="none" />
      <line x1="106" y1="52" x2="106" y2="68" {...faint} />
      <line x1="114" y1="52" x2="114" y2="68" {...faint} />
      {/* plug body on the left */}
      <rect x="34" y="46" width="30" height="28" rx="7" {...stroke} fill="none" />
      {/* prongs reaching toward the socket */}
      <line x1="64" y1="54" x2="86" y2="54" {...stroke} />
      <line x1="64" y1="66" x2="86" y2="66" {...stroke} />
      {/* cable */}
      <path d="M34 60 C 18 60 18 88 32 88" {...stroke} fill="none" />
      {/* the spark of connection — one orange accent in the gap */}
      <path
        d="M90 46 L86 60 L92 60 L88 74"
        stroke={SIGNAL}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}
