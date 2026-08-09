import type { ActionEventRecord, MissionQuestion, MissionStepRecord } from "../types";
import { isConsequentialTool } from "./capabilities";

/**
 * The execution contract: what the user actually approved.
 *
 * Approving a mission means "I approve THIS plan", not "do whatever seems
 * best". Cosigno may retry, poll, paginate, read what it needs, recover, and
 * carry straight on through the remaining approved steps — those are execution
 * details, not new decisions. What it may never do is quietly grow the plan
 * and keep going as though the larger plan had been approved too.
 *
 * The plan CAN legitimately grow: analyze.extract appends a follow-up draft and
 * its approval step when it measurably finds follow-up material. That is useful
 * and should not be banned. It just has to be visible, and consequential
 * additions have to be decided by a person rather than assumed.
 *
 * The contract is DERIVED rather than stored, which is the point: it comes from
 * the immutable step rows and the immutable approval event log, so there is no
 * separate record to drift, be rewritten, or be forgotten to update. A step is
 * inside the contract if it already existed when the user signed.
 */

export interface ScopeVerdict {
  /** True when the step may run without asking again. */
  allowed: boolean;
  /** Set when the step needs a fresh decision. */
  reason?: string;
}

/** The answer text that grants a one-step scope extension. */
export const SCOPE_APPROVE = "run this step";
/** The answer text that refuses it. */
export const SCOPE_REFUSE = "skip this step";

/**
 * When the user first signed for this mission. Steps that already existed at
 * that instant are the plan they saw.
 *
 * Only a HUMAN approval starts the clock. An auto-approved tier-1 card is the
 * engine clearing its own low-risk work, and treating that as the user having
 * blessed the plan would let a mission bootstrap its own contract.
 */
export function contractCutoff(events: ActionEventRecord[]): string | null {
  const human = events
    .filter((e) => e.type === "approved" && e.actor === "user" && e.detail?.auto !== true)
    .map((e) => e.created_at)
    .sort();
  return human[0] ?? null;
}

/** Did this step exist when the user signed? */
export function withinContract(step: MissionStepRecord, cutoff: string | null): boolean {
  // Nothing approved yet → nothing has been contracted, and every consequential
  // step still faces its own approval card as usual.
  if (cutoff === null) return true;
  // STRICTLY earlier. A tie means the step and the signature landed in the same
  // instant, which is not evidence the user saw it — and on this gate the
  // permissive reading of an ambiguous case is the one that executes something
  // unapproved. Real approvals trail plan compilation by human seconds, so this
  // costs nothing legitimate.
  return Date.parse(step.created_at) < Date.parse(cutoff);
}

/**
 * May this step run right now?
 *
 * Out-of-contract steps are not banned outright — that would block the harmless
 * majority (reading more data, drafting a file) that the contract explicitly
 * permits as execution detail. Only steps that CHANGE something outside cosigno
 * need a fresh decision, because those are the ones where "I didn't approve
 * that" is a real complaint.
 */
export function scopeVerdict(
  step: MissionStepRecord,
  cutoff: string | null
): ScopeVerdict {
  if (withinContract(step, cutoff)) return { allowed: true };

  // Read-only or draft work added mid-flight is execution detail: it changes
  // nothing outside cosigno and is often exactly what the next approved step
  // needs in order to run at all.
  if (!isConsequentialTool(step.tool)) return { allowed: true };

  // Already decided by a human on this very step.
  const answer = (step.input ?? {}).answer;
  if (answer === SCOPE_APPROVE) return { allowed: true };
  if (typeof answer === "string" && answer.length > 0) {
    return { allowed: false, reason: "refused" };
  }

  return {
    allowed: false,
    reason: "unapproved",
  };
}

/**
 * The question posed when a consequential step appears that the user never saw.
 *
 * It names the gap plainly. A prompt that reads like routine progress would get
 * waved through, which would make the whole gate decorative.
 */
export function scopeQuestion(step: MissionStepRecord): Omit<MissionQuestion, "step_id"> {
  return {
    question: `“${step.purpose}” wasn't in the plan you approved. run it?`,
    why: "Cosigno added this step after you signed, based on what it found while working. Anything that changes something outside cosigno needs your decision, even mid-mission.",
    options: [SCOPE_APPROVE, SCOPE_REFUSE],
    recommended: undefined,
    effect: `${SCOPE_APPROVE} runs only this step. ${SCOPE_REFUSE} skips it and the mission carries on with the rest of the approved plan.`,
  };
}
