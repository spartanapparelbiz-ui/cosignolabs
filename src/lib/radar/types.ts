import type { RadarCategory } from "../types";

export type { RadarCategory };

export type RadarConfidence = "high" | "medium" | "low";

/**
 * A single Radar finding. The strict separation the product requires:
 *  - `observed`: literal facts read from the user's OWN database state. This
 *    is not an LLM guess — it's exactly what the rows say.
 *  - `inference`: what Cosigno concludes from those facts (deterministic).
 *  - `recommendation`: the suggested next step (still requires approval to run).
 *
 * `suggestedCommand`, when present, is what "Prepare Mission" compiles — it is
 * NEVER executed here; it only ever produces a prepared mission + CoSign Card
 * that enters the normal approval gate.
 */
export interface RadarItem {
  /** Stable key: same condition → same key, so a dismiss/snooze sticks. */
  key: string;
  category: RadarCategory;
  title: string;
  /** What Cosigno noticed — plain, factual. */
  observed: string;
  /** Where the information came from (data + connections involved). */
  source: string;
  /** Why it matters. */
  why: string;
  /** Deterministic inference drawn from the observed facts. */
  inference: string;
  /** The recommended next step (human-readable). */
  recommendation: string;
  confidence: RadarConfidence;
  /** Connections/data this item touches, for the "involves" chips. */
  involves: string[];
  /**
   * How "Prepare Mission" turns this into an approval-gated mission, if it can:
   *  - suggestedTemplate: a known, inspectable mission template.
   *  - suggestedCommand: a free goal compiled through the normal compiler
   *    (honestly refused if unsupported — never a broken mission).
   *  - both null: the item points at an existing surface (approve a card,
   *    resume a mission, reconnect an app); Prepare Mission does not apply and
   *    the UI shows the recommendation as the primary action instead.
   */
  suggestedTemplate:
    | "inbox_cleanup"
    | "followups"
    | "daily_brief"
    | "meeting_prep"
    | "laptop_compare"
    | null;
  suggestedCommand: string | null;
  /** Sort weight (higher = more urgent). */
  weight: number;
}

export const RADAR_CATEGORY_META: Record<
  RadarCategory,
  { label: string; blurb: string }
> = {
  at_risk: { label: "At Risk", blurb: "Something could go wrong if it's left alone." },
  forgotten: { label: "Forgotten", blurb: "Started but never finished." },
  opportunity: { label: "Opportunity", blurb: "A useful thing you could do next." },
  routine: { label: "Routine", blurb: "A repeat you could put on rails." },
  waiting: { label: "Waiting", blurb: "Waiting on someone or something else." },
  needs_you: { label: "Needs You", blurb: "A decision only you can make." },
};
