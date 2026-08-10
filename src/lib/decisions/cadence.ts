import type { ActionRecord } from "../types";
import { duration, minutesBetween } from "../time";

/**
 * Decision cadence — the one prediction cosigno can make honestly, because it
 * is computed from the user's own recorded behaviour and it always shows its
 * evidence.
 *
 * The claim is narrow on purpose: "you usually decide within X, and this one
 * has waited Y." Nothing here predicts what the user WILL decide, whether an
 * action will succeed, or when work will finish — those would be guesses
 * wearing the same typeface as measurements. Time-to-decision is different:
 * every resolved approval carries its proposed and resolved timestamps, so
 * the median is a fact about the past, and comparing a waiting card against
 * it is arithmetic, not clairvoyance.
 *
 * The rules that keep it honest:
 *
 *   1. **The evidence base is always printed.** "based on your last 24
 *      decisions" is part of the sentence, not a tooltip. A prediction that
 *      hides its sample size is asking to be trusted rather than checked.
 *   2. **Small samples say nothing.** Below MIN_SAMPLE the cadence is
 *      undefined and no comparison is drawn — three data points produce a
 *      median, but not one worth repeating to a person.
 *   3. **Only meaningful exceedances speak.** A card at 1.2× the median is
 *      normal life, not a signal; the threshold is deliberately coarse so
 *      that when the line does appear, it means something.
 *
 * Pure and total. No I/O, no Date.now() — the caller supplies `now`.
 */

/** Fewer resolved decisions than this and no cadence is claimed at all. */
export const MIN_SAMPLE = 5;

/** A wait must exceed the median by this factor before anything is said. */
const EXCEEDS = 3;

export interface DecisionCadence {
  /** Median minutes from proposal to resolution. */
  medianMinutes: number;
  /** How many resolved decisions the median is computed from. */
  sample: number;
  /** "about 20 minutes" — the median, said the way a person would. */
  medianLabel: string;
}

/** Statuses that mean the user actually decided (approve or veto). */
const DECIDED = new Set(["executed", "vetoed", "failed"]);

/** "about 20 minutes" — the approx duration register from lib/time. */
export function durationLabel(minutes: number): string {
  return duration(minutes, "approx");
}

/**
 * The user's decision cadence, from their resolved approvals.
 *
 * Tier-1 auto actions are excluded by construction: they resolve in
 * milliseconds without a human, and folding them in would produce a "median"
 * that flatters cosigno rather than describing the person. Only actions that
 * actually waited for a decision count.
 */
export function decisionCadence(resolved: ActionRecord[]): DecisionCadence | null {
  const waits: number[] = [];
  for (const a of resolved) {
    if (!DECIDED.has(a.status) || !a.resolved_at) continue;
    if (a.tier === 1) continue; // never waited on a person
    const mins = minutesBetween(a.created_at, a.resolved_at);
    if (mins !== null) waits.push(mins);
  }
  if (waits.length < MIN_SAMPLE) return null;

  waits.sort((a, b) => a - b);
  const mid = Math.floor(waits.length / 2);
  const median =
    waits.length % 2 === 1 ? waits[mid] : (waits[mid - 1] + waits[mid]) / 2;

  return {
    medianMinutes: median,
    sample: waits.length,
    medianLabel: durationLabel(median),
  };
}

/* ------------------------------------------------------------- assessment */

export interface WaitAssessment {
  /** The full sentence, evidence included. */
  text: string;
  /** True when this wait is unusually long against the user's own history. */
  unusual: boolean;
}

/**
 * How this card's wait compares to the user's own cadence.
 *
 * Returns null when there is nothing worth saying: no cadence yet, or a wait
 * that is ordinary. The line only ever appears when the comparison carries
 * information — an assessment on every card would train people to skip the
 * one that matters.
 */
export function assessWait(
  action: Pick<ActionRecord, "created_at">,
  cadence: DecisionCadence | null,
  now: Date
): WaitAssessment | null {
  if (!cadence) return null;
  const waited = minutesBetween(action.created_at, now.toISOString());
  if (waited === null) return null;

  // Never flag anything under an hour, whatever the median: a person who
  // usually decides in two minutes is not "late" at twenty.
  if (waited < 60) return null;
  if (waited < cadence.medianMinutes * EXCEEDS) return null;

  return {
    unusual: true,
    text: `waiting ${durationLabel(waited).replace(/^about /, "")} — you usually decide within ${cadence.medianLabel.replace(/^about /, "")}, based on your last ${cadence.sample} decisions.`,
  };
}

/**
 * The one-line cadence summary for the approvals page header.
 *
 * Stated as a fact about the past, never as a promise: "you typically decide
 * within about 20 minutes" is a description; "this will be decided in 20
 * minutes" would be a forecast nobody made.
 */
export function cadenceLine(cadence: DecisionCadence | null): string | null {
  if (!cadence) return null;
  return `you typically decide within ${cadence.medianLabel} — based on your last ${cadence.sample} decisions.`;
}
