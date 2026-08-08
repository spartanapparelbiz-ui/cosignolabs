/**
 * Delegation intent — the user describes what they want; cosigno decides the
 * workflow. A request is one of:
 *   - mission     one-time objective → the mission compiler ("prepare
 *                 tomorrow's meeting")
 *   - watch       continuous monitoring → a monitor-mode recurring rule
 *                 ("watch for emails from investors")
 *   - automation  recurring preparation → a prepare-mode recurring rule
 *                 ("every monday, analyze ad performance")
 *   - read        a question about material the user has handed over →
 *                 answered now, directly ("what's wrong with this photo?")
 *
 * The "read" kind exists because its absence was a real defect. Every request
 * used to become a mission, so "give me a detailed report on this photo"
 * compiled into a multi-step research plan and came back with web research
 * about a picture nobody had opened. A question about attached material is
 * not a mission — it is a question, and it gets an answer.
 *
 * Pure and deterministic so it's testable and safe on the client. When in
 * doubt it returns "mission" — the compiler's goal-understanding screen is
 * the safety net, and nothing here ever executes anything.
 */

export type DelegationKind = "mission" | "watch" | "automation" | "read";

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

/**
 * RETURN TO ME — the user can define when cosigno should hand control back:
 * "research these companies and return to me when you've narrowed them to
 * five." The condition is extracted for the Delegation Agreement (and the
 * full text still flows to the planner unchanged, so the plan honors it).
 */
export function returnCondition(input: string): string | null {
  const m =
    /(?:\band\s+|\bthen\s+)?return(?:\s+(?:to\s+me|control))?\s+(?:when|if|once|after)\s+(.+)$/i.exec(
      input.trim()
    );
  if (!m) return null;
  return m[1].trim().replace(/[.!?]+$/, "");
}

/**
 * Verbs that mean "act on the world", not "read what I gave you". If one of
 * these is present the request is a mission even with material attached:
 * "email this photo to my landlord" is work, not a question.
 */
const ACTS_ON_WORLD_RE =
  /\b(send|email|e-mail|reply|respond to|forward|post|publish|tweet|buy|purchase|order|pay|book|schedule|invite|message|dm|text (?:him|her|them|my)|call|share (?:it|this|these|them) with|upload to|add to my calendar|file|submit)\b/i;

/**
 * Reading verbs. Present with material attached, the answer is the deliverable
 * — there is nothing to plan and nothing to approve.
 */
const READS_MATERIAL_RE =
  /\b(describe|analy[sz]e|analysis|report on|detailed report|what(?:'s| is| are)? (?:in|on|wrong with|this|that|these)|read|transcribe|extract|identify|caption|summari[sz]e|summary|explain|tell me about|look at|check|review|compare|how many|count|translate|ocr|write.{0,20}(?:caption|description|alt text))\b/i;

export function classifyDelegation(
  input: string,
  ctx: { hasAttachments?: boolean } = {}
): DelegationIntent {
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
  // Material in hand, and nothing asked of the outside world: answer it.
  // A recurring or watch request is checked first (above) on purpose — "every
  // monday, check this dashboard" is a standing rule, not a one-off read.
  if (ctx.hasAttachments && !ACTS_ON_WORLD_RE.test(text)) {
    return { kind: "read", name: nameFrom(text), interval_hours: 24, mode: "prepare" };
  }
  // No attachment, but an unmistakable read verb aimed at nothing external
  // ("summarize this", "what does this say") is still a question. Without
  // material there is nothing to read, so this stays a mission — the
  // compiler's understanding screen will say what it needs.
  if (ctx.hasAttachments && READS_MATERIAL_RE.test(text)) {
    return { kind: "read", name: nameFrom(text), interval_hours: 24, mode: "prepare" };
  }
  return { kind: "mission", name: nameFrom(text), interval_hours: 24, mode: "prepare" };
}
