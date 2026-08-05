import type { MissionRecord, MissionStepRecord } from "../types";

/**
 * Missions, in the words a person would use.
 *
 * The engine's vocabulary — steps, tools, operators, contracts, plan versions,
 * verification records — exists to make cosigno trustworthy. None of it helps
 * anyone understand what is happening right now, and most of it actively gets
 * in the way. This module is the whole translation, kept apart from the
 * rendering so the phrasing can be tested rather than eyeballed.
 *
 * The rule it follows everywhere: say only what is known. A step that recorded
 * no result gets no invented one, and "waiting" is never dressed up as
 * progress.
 */

export type StepPhase = "done" | "current" | "upcoming" | "needs_you" | "failed" | "skipped";

export interface NarratedStep {
  id: string;
  phase: StepPhase;
  /** Natural language, tense-matched to the phase. */
  headline: string;
  /** What it actually produced. Present only when the step recorded something. */
  evidence?: string;
  /** Set when this step is why the mission stopped. */
  blockedReason?: string;
}

export interface MissionNarration {
  steps: NarratedStep[];
  current: NarratedStep | null;
  next: NarratedStep | null;
  doneCount: number;
  total: number;
  /** One sentence about the mission as a whole. */
  status: string;
  /** Why work stopped, in plain language. Null while it is moving. */
  pausedBecause: string | null;
  /** True when the mission has settled and nothing more will happen on its own. */
  finished: boolean;
}

/* ------------------------------------------------------------------ tense */

/** Verbs that need their final consonant doubled before -ing. */
const DOUBLES = new Set(["run", "set", "put", "cut", "get", "plan", "stop", "begin", "submit"]);

/**
 * Turn an imperative into its -ing form: "Read your repositories" becomes
 * "Reading your repositories".
 *
 * Only the leading word is touched, and only when it looks like a verb we
 * recognise. An unrecognised phrase is returned untouched rather than
 * mangled — a slightly stiff label beats a confidently wrong one.
 */
export function toProgressive(purpose: string): string {
  const trimmed = purpose.trim();
  if (!trimmed) return purpose;

  const [first, ...rest] = trimmed.split(/\s+/);
  const bare = first.toLowerCase();
  if (!/^[a-z]+$/.test(bare)) return trimmed;
  // Already progressive.
  if (bare.endsWith("ing")) return trimmed;

  let stem: string;
  if (DOUBLES.has(bare)) stem = `${bare}${bare.slice(-1)}ing`;
  else if (/[^aeiou]e$/.test(bare)) stem = `${bare.slice(0, -1)}ing`; // write → writing
  else if (/ie$/.test(bare)) stem = `${bare.slice(0, -2)}ying`; // tie → tying
  else stem = `${bare}ing`;

  const capped = stem.charAt(0).toUpperCase() + stem.slice(1);
  return [capped, ...rest].join(" ");
}

/* ------------------------------------------------------------- narration */

const DONE_STATES = new Set(["completed", "skipped", "vetoed", "canceled", "failed"]);

function evidenceOf(step: MissionStepRecord): string | undefined {
  const summary = step.output?.summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  return undefined;
}

function phaseOf(step: MissionStepRecord): StepPhase {
  switch (step.state) {
    case "completed":
      return "done";
    case "skipped":
    case "vetoed":
    case "canceled":
      return "skipped";
    case "failed":
      return "failed";
    case "running":
    case "retrying":
    case "verifying":
      return "current";
    case "awaiting_approval":
    case "awaiting_input":
      return "needs_you";
    default:
      return "upcoming";
  }
}

function headlineFor(step: MissionStepRecord, phase: StepPhase): string {
  const purpose = step.purpose.trim();
  switch (phase) {
    case "current":
      // "Executing" tells nobody anything. The step's own purpose does.
      return step.state === "verifying" ? `Checking: ${purpose}` : toProgressive(purpose);
    case "needs_you":
      return purpose;
    default:
      return purpose;
  }
}

/**
 * Why the mission stopped, said plainly.
 *
 * Never "awaiting_approval" and never "needs approval" on its own — a status
 * word is not a reason. The point is that the person reads it and immediately
 * knows what decision is being asked of them.
 */
function pauseReason(mission: MissionRecord, steps: MissionStepRecord[]): string | null {
  if (mission.state === "paused") return "You paused this. Resume it whenever you're ready.";
  if (mission.state === "blocked") {
    return mission.error ?? "cosigno stopped and needs you before it can carry on.";
  }

  const question = mission.pending_question;
  if (question) {
    // The question already carries its own plain-language explanation.
    return question.why || question.question;
  }

  const waiting = steps.find((s) => s.state === "awaiting_approval");
  if (waiting) {
    return `cosigno prepared “${waiting.purpose}” and won't do it without your signature.`;
  }
  return null;
}

function statusSentence(
  mission: MissionRecord,
  narrated: NarratedStep[],
  current: NarratedStep | null,
  doneCount: number,
  total: number
): string {
  switch (mission.state) {
    case "completed":
      return `Finished — all ${total} step${total === 1 ? "" : "s"} done.`;
    case "partial":
      // Deliberately not "finished". Some of it didn't happen or couldn't be
      // confirmed, and that difference is the whole point of saying so.
      return `Done what it could — ${doneCount} of ${total} step${total === 1 ? "" : "s"} completed. Some work didn't finish or couldn't be confirmed.`;
    case "failed":
      return "This didn't work out. Nothing further will happen on its own.";
    case "stopped":
      return "You stopped this mission.";
    case "paused":
      return "Paused — nothing is running.";
    case "awaiting_approval":
    case "awaiting_input":
      return "Waiting on you before it can carry on.";
    case "blocked":
      return "Stopped — cosigno can't carry on without you.";
    default:
      return current
        ? `${current.headline} — ${doneCount} of ${total} done.`
        : `Getting started — ${total} step${total === 1 ? "" : "s"} planned.`;
  }
}

export function narrateMission(
  mission: MissionRecord,
  steps: MissionStepRecord[]
): MissionNarration {
  const ordered = [...steps].sort((a, b) => a.idx - b.idx);
  const question = mission.pending_question;

  const narrated: NarratedStep[] = ordered.map((s) => {
    const phase = phaseOf(s);
    const evidence = evidenceOf(s);
    const isBlocker = question?.step_id === s.id || (phase === "needs_you" && !question);
    return {
      id: s.id,
      phase,
      headline: headlineFor(s, phase),
      ...(evidence ? { evidence } : {}),
      // A failed step's own error is the most specific thing available.
      ...(phase === "failed" && s.error ? { blockedReason: s.error } : {}),
      ...(isBlocker && phase === "needs_you" && question?.question
        ? { blockedReason: question.question }
        : {}),
    };
  });

  const current = narrated.find((n) => n.phase === "current") ?? null;
  const blocker = narrated.find((n) => n.phase === "needs_you") ?? null;
  // "Next" is the first thing that hasn't started — what happens after the
  // thing happening now, or after the decision being waited on.
  const next = narrated.find((n) => n.phase === "upcoming") ?? null;

  const doneCount = ordered.filter((s) => s.state === "completed").length;
  const total = ordered.length;

  return {
    steps: narrated,
    current: current ?? blocker,
    next,
    doneCount,
    total,
    status: statusSentence(mission, narrated, current, doneCount, total),
    pausedBecause: pauseReason(mission, ordered),
    finished: ["completed", "partial", "failed", "stopped"].includes(mission.state),
  };
}

/** Everything already settled, in order — the evidence trail. */
export function finishedSteps(n: MissionNarration): NarratedStep[] {
  return n.steps.filter((s) => DONE_STATES.has(s.phase === "skipped" ? "skipped" : s.phase));
}
