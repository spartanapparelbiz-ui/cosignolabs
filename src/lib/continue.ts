import { delegationMomentum } from "./objectives";
import type { Momentum } from "./state";
import type { ActionRecord, SessionRecord } from "./types";

/**
 * Continuation intelligence — Finish This / Do Everything You Can / Rescue,
 * plus Brief Me and Why Is This Waiting. All of this is built on EXISTING
 * infrastructure: the same planner pipeline (runCommand) that every command
 * already uses, and the real state of a delegation's actions. Nothing is
 * faked — continuation proposes the next steps and they flow through the
 * unchanged boundary (approve / sign); briefs are deterministic reads of the
 * audit record. No new APIs, no new keys.
 */

export type ContinueMode = "finish" | "everything" | "rescue";

/** Short labels for the three continuation intents. */
export const CONTINUE_LABEL: Record<ContinueMode, string> = {
  finish: "Finish this",
  everything: "Do everything you can",
  rescue: "Rescue this",
};

function bullet(items: string[]): string {
  return items.map((s) => `- ${s}`).join("\n");
}

/**
 * Compose an HONEST continuation instruction for the existing planner from a
 * delegation's real state: it names what's already done so completed work
 * isn't redone, and asks only for what remains — stopping at the boundary for
 * anything needing approval or signature. The planner turns this into
 * proposals exactly like a typed command; nothing auto-executes beyond
 * tier-1, so the user stays in control.
 */
export function buildContinuationCommand(
  goal: string,
  actions: Pick<ActionRecord, "status" | "summary">[],
  mode: ContinueMode
): string {
  const done = actions.filter((a) => a.status === "executed").map((a) => a.summary);
  const failed = actions.filter((a) => a.status === "failed").map((a) => a.summary);
  const pending = actions.filter((a) => a.status === "proposed").map((a) => a.summary);

  const context = [
    done.length ? `Already completed (do NOT redo these):\n${bullet(done)}` : "",
    pending.length ? `Already prepared and waiting for my decision (do NOT duplicate):\n${bullet(pending)}` : "",
    failed.length ? `Previously failed or blocked:\n${bullet(failed)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (mode === "rescue") {
    return [
      `This delegation is stuck and I want you to rescue it. The intended outcome is: "${goal}".`,
      context,
      "Investigate why it stopped and find a SAFE alternative path using the tools already available — for example, look for a missing item in a connected source, or prepare a request for it. Do not retry a failed irreversible action, and do not loop. If you genuinely cannot continue safely, prepare nothing and I'll take it from here.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const verb =
    mode === "everything"
      ? "Do everything you can toward this outcome"
      : "Continue this delegation toward its outcome";
  return [
    `${verb}: "${goal}".`,
    context,
    "Work only on what remains, without redoing completed or already-prepared work. Prepare each next step and stop at the boundary — anything that needs my approval or signature should wait for me, not execute on its own.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------------------------------------------ brief */

export interface DelegationBrief {
  goal: string;
  objective: string | null;
  momentum: Momentum;
  complete: number;
  waiting: number;
  failed: number;
  total: number;
  /** Why is this waiting / blocked / moving — one honest sentence. */
  why: string;
  /** Can cosigno propose a next step right now (Finish/Do-everything is useful)? */
  can_move_forward: boolean;
  /** The single most useful next thing. */
  next: string;
}

/**
 * Brief Me / Why Is This Waiting — a deterministic read of a delegation's
 * real state. No model call, no invented progress: every line maps to an
 * actual action status.
 */
export function delegationBrief(
  session: Pick<SessionRecord, "title">,
  actions: Pick<ActionRecord, "status">[],
  objectiveTitle: string | null = null
): DelegationBrief {
  const complete = actions.filter((a) => a.status === "executed").length;
  const waiting = actions.filter((a) => a.status === "proposed").length;
  const failed = actions.filter((a) => a.status === "failed").length;
  const vetoed = actions.filter((a) => a.status === "vetoed").length;
  const total = actions.length;
  const momentum = delegationMomentum(actions);

  let why: string;
  let next: string;
  let canMove = false;

  if (waiting > 0) {
    why = `Waiting on you: ${waiting} prepared action${waiting === 1 ? "" : "s"} ${waiting === 1 ? "is" : "are"} at the boundary for your approval or signature.`;
    next = "Review the decision at the boundary — that's what's holding this.";
  } else if (failed > 0) {
    why = `Blocked: ${failed} step${failed === 1 ? "" : "s"} failed or couldn't complete.`;
    next = "Rescue this — cosigno will look for a safe alternative before asking you.";
    canMove = true;
  } else if (total === 0) {
    why = "Just delegated — cosigno hasn't prepared anything yet.";
    next = "Cosigno is planning the first steps.";
    canMove = true;
  } else if (vetoed > 0 && complete === 0) {
    why = "You vetoed the prepared work; nothing further is in motion.";
    next = "Delegate the next step, or finish this to have cosigno propose a fresh approach.";
    canMove = true;
  } else {
    // Everything resolved with no pending/failed — treat as effectively done,
    // but offer to push further if the outcome may need more.
    why = `Nothing is pending — ${complete} step${complete === 1 ? "" : "s"} completed and nothing is waiting.`;
    next = "Finish this if the outcome isn't fully reached, or leave it — it's clear.";
    canMove = complete > 0;
  }

  return {
    goal: session.title,
    objective: objectiveTitle,
    momentum,
    complete,
    waiting,
    failed,
    total,
    why,
    can_move_forward: canMove,
    next,
  };
}
