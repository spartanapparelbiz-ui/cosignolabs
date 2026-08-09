import type { MissionRecord, MissionStepRecord } from "../types";
import { missionStatus, type Status } from "../status";
import { narrateMission } from "./narrate";
import { heroResult } from "./today";

/**
 * A MISSION IN FIVE ANSWERS.
 *
 * The old mission card was a technical readout — steps, tools, counts — and
 * reading it took real effort even for someone who built the thing. The test
 * a card has to pass is much harder than "is it accurate": a person glancing
 * at it for two seconds has to leave with the right picture.
 *
 * Five questions do that, and nothing else has to be on the card:
 *
 *   WHAT   what is cosigno trying to accomplish?
 *   NOW    what is happening right now?
 *   NEXT   what happens after that?
 *   YOU    does cosigno need me?
 *   DONE   what has actually been finished?
 *
 * The engine's vocabulary keeps its complexity underneath. This is the same
 * data narrateMission already translates, reduced to the shape a card can
 * render without deciding anything for itself — which is what keeps the
 * phrasing testable instead of eyeballed.
 *
 * The rule inherited from narrate.ts and kept absolutely: say only what is
 * known. A mission with no recorded outcome gets no invented headline, and a
 * queued mission is never described as working.
 */

/** Why a mission is sitting on the user, when it is. */
export type NeedsYouKind = "approval" | "question" | "budget" | "reconnect";

export interface MissionNeedsYou {
  kind: NeedsYouKind;
  /** One sentence, in the user's terms. */
  ask: string;
  /** The label of the control that resolves it. */
  cta: string;
}

export interface MissionBrief {
  /** WHAT — the goal, as the user asked for it. */
  what: string;
  /** NOW — the live sentence, or null when nothing is running. */
  now: string | null;
  /** NEXT — the single next thing, or null at the end. */
  next: string | null;
  /** YOU — null when cosigno doesn't need anything. */
  you: MissionNeedsYou | null;
  /** DONE — what actually landed. `headline` is null when nothing recorded. */
  done: { count: number; total: number; headline: string | null };
  status: Status;
  /** 0–1, from completed steps. Null when the plan has no steps yet. */
  progress: number | null;
  /** True once nothing more will happen without a person. */
  settled: boolean;
}

/** Trim a goal to something a card can hold without becoming a paragraph. */
function goalLine(goal: string): string {
  const g = goal.trim().replace(/\s+/g, " ");
  if (!g) return "Untitled request";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/**
 * What cosigno needs from the person, if anything — in the order that matters
 * to them, not the order the engine discovers it.
 *
 * A pending question outranks a pending approval: the question blocks the plan
 * itself, so answering an approval first would sign off work that may be about
 * to change.
 */
function needsYou(
  mission: MissionRecord,
  steps: MissionStepRecord[]
): MissionNeedsYou | null {
  if (mission.pending_question?.question) {
    return {
      kind: "question",
      ask: mission.pending_question.question,
      cta: "Answer",
    };
  }
  const waiting = steps.filter((s) => s.state === "awaiting_approval");
  if (waiting.length > 0) {
    return {
      kind: "approval",
      ask:
        waiting.length === 1
          ? `Approve: ${waiting[0].purpose.replace(/\.$/, "").toLowerCase()}`
          : `${waiting.length} actions are waiting for your approval`,
      cta: waiting.length === 1 ? "Review it" : "Review them",
    };
  }
  if (mission.state === "blocked") {
    return {
      kind: "reconnect",
      ask: "cosigno can't continue until something is reconnected",
      cta: "See why",
    };
  }
  // A paused mission is waiting on a person by definition — it will not move
  // again on its own, and a card that doesn't say so leaves work sitting
  // there indefinitely.
  if (mission.state === "paused") {
    return {
      kind: "budget",
      ask: "cosigno stopped and is waiting for you to say how much further to go",
      cta: "Decide",
    };
  }
  return null;
}

export function missionBrief(
  mission: MissionRecord,
  steps: MissionStepRecord[] = []
): MissionBrief {
  const narration = narrateMission(mission, steps);
  const status = missionStatus(mission.state);
  const settled = narration.finished;

  // "Now" is only ever a thing that is genuinely in flight. A queued mission
  // has not started, and saying "working on it" would be the first small lie
  // on the most-read screen in the product.
  const now = narration.nowWorking?.phase === "current" ? narration.nowWorking.headline : null;

  const done = steps.filter((s) => s.state === "completed").length;
  const total = steps.length;

  return {
    what: goalLine(mission.goal),
    now,
    next: settled ? null : (narration.upNext?.headline ?? null),
    you: needsYou(mission, steps),
    done: {
      count: done,
      total,
      headline: heroResult(mission, steps),
    },
    status,
    progress: total > 0 ? done / total : null,
    settled,
  };
}
