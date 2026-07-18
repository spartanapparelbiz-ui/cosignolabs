/**
 * Delegation intent — the user describes what they want; cosigno decides the
 * workflow. A request is one of:
 *   - mission     one-time objective → the mission compiler ("prepare
 *                 tomorrow's meeting")
 *   - watch       continuous monitoring → a monitor-mode recurring rule
 *                 ("watch for emails from investors")
 *   - automation  recurring preparation → a prepare-mode recurring rule
 *                 ("every monday, analyze ad performance")
 *
 * Pure and deterministic so it's testable and safe on the client. When in
 * doubt it returns "mission" — the compiler's goal-understanding screen is
 * the safety net, and nothing here ever executes anything.
 */

export type DelegationKind = "mission" | "watch" | "automation";

export interface DelegationIntent {
  kind: DelegationKind;
  /** For watch/automation: a clean display name derived from the request. */
  name: string;
  /** For watch/automation: re-run cadence in hours. */
  interval_hours: number;
  /** watch → monitor (report only) unless the user asked cosigno to prepare. */
  mode: "monitor" | "prepare";
}

const WATCH_RE =
  /^(please\s+)?(watch|monitor|keep\s+(an\s+eye|watch)|alert\s+me|notify\s+me|tell\s+me\s+(if|when)|let\s+me\s+know\s+(if|when)|flag)\b/i;

const RECURRING_RE =
  /^(please\s+)?(every|each)\s+(hour|day|morning|evening|week|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|(\bhourly\b|\bdaily\b|\bweekly\b)/i;

function intervalFrom(text: string): number {
  if (/\b(hour|hourly)\b/i.test(text)) return 1;
  if (/\b(week|weekly|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text)) return 168;
  return 24; // day / morning / evening / weekday / default
}

function nameFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  const capped = clean.charAt(0).toUpperCase() + clean.slice(1);
  return capped.length > 80 ? `${capped.slice(0, 77)}…` : capped;
}

export function classifyDelegation(input: string): DelegationIntent {
  const text = input.trim();
  if (WATCH_RE.test(text)) {
    return {
      kind: "watch",
      name: nameFrom(text),
      // Watches check continuously in spirit; hourly is the honest cadence
      // the scheduler actually supports.
      interval_hours: 1,
      // "watch … and prepare replies" → prepare proposals; plain watches
      // only report (monitor).
      mode: /\b(prepare|draft|respond|reply)\b/i.test(text) ? "prepare" : "monitor",
    };
  }
  if (RECURRING_RE.test(text)) {
    return {
      kind: "automation",
      name: nameFrom(text),
      interval_hours: intervalFrom(text),
      mode: "prepare",
    };
  }
  return { kind: "mission", name: nameFrom(text), interval_hours: 24, mode: "prepare" };
}
