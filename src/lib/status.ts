import type { ActionRecord, ActionStatus, MissionRecord, MissionStepState } from "./types";

/**
 * Five statuses. Not six, not "awaiting your sign-off", not "executing…".
 *
 *   🟢 working          cosigno is doing it right now
 *   🟡 waiting          it can't proceed yet, and not because of you
 *   🔵 needs approval   you are the thing it's waiting for
 *   🔴 failed           it didn't complete
 *   ⚪ finished         it's over — done, rejected, or closed
 *
 * A product that invents a new status word per surface teaches its users a
 * vocabulary instead of a state. This module is the only place a status word
 * is chosen, so "working" means exactly one thing everywhere it appears.
 *
 * Note that FINISHED covers both "it ran" and "you rejected it". That's the
 * lifecycle, not the outcome — the timeline's ✓/✕ carries the outcome, and
 * conflating the two is what produces a sixth status.
 */

export type LiveStatus = "working" | "waiting" | "needs_approval" | "failed" | "finished";

export interface StatusMeta {
  status: LiveStatus;
  /** The only label ever shown for this state. */
  label: string;
  /** Tailwind classes for the status dot. */
  dot: string;
  /** Chip styling, for the few places a chip is warranted. */
  chip: string;
}

export const STATUS_META: Record<LiveStatus, StatusMeta> = {
  working: {
    status: "working",
    label: "working",
    dot: "bg-signal animate-orb-pulse",
    chip: "bg-signal/20 text-ink ring-1 ring-inset ring-signal/50",
  },
  waiting: {
    status: "waiting",
    label: "waiting",
    dot: "bg-cream-deep ring-1 ring-inset ring-ink/25",
    chip: "bg-cream-deep text-ink-soft",
  },
  needs_approval: {
    status: "needs_approval",
    label: "needs approval",
    dot: "bg-ink",
    chip: "bg-ink text-cream",
  },
  failed: {
    status: "failed",
    label: "failed",
    dot: "bg-transparent ring-1 ring-inset ring-ink/50",
    chip: "text-ink ring-1 ring-inset ring-ink/40",
  },
  finished: {
    status: "finished",
    label: "finished",
    dot: "bg-ink/15",
    chip: "bg-cream-deep text-ink-soft",
  },
};

const FROM_ACTION: Record<ActionStatus, LiveStatus> = {
  proposed: "needs_approval",
  approved: "working",
  executing: "working",
  executed: "finished",
  failed: "failed",
  vetoed: "finished",
};

/** The one status for an action. */
export function statusOf(action: Pick<ActionRecord, "status">): LiveStatus {
  return FROM_ACTION[action.status] ?? "waiting";
}

export function statusLabel(status: LiveStatus): string {
  return STATUS_META[status].label;
}

/**
 * The status of a whole task, from its steps. Worst-first: anything failed
 * makes the task failed, then a human block, then in-flight work — a task is
 * only finished when every step is.
 */
export function statusOfTask(steps: readonly { status: ActionStatus }[]): LiveStatus {
  if (steps.length === 0) return "waiting";
  const live = steps.map((s) => FROM_ACTION[s.status] ?? "waiting");
  if (live.includes("failed")) return "failed";
  if (live.includes("needs_approval")) return "needs_approval";
  if (live.includes("working")) return "working";
  if (live.every((s) => s === "finished")) return "finished";
  return "waiting";
}

/**
 * Mission states collapse onto the same five. A mission that is "queued",
 * "verifying" or "retrying" is, to the person watching, either working or
 * waiting — those are engine states, and the engine is not what they're
 * looking at.
 *
 * `awaiting_input` maps to NEEDS APPROVAL because the blue state means one
 * thing throughout the product: you are what it's waiting for.
 */
const FROM_MISSION: Record<MissionRecord["state"], LiveStatus> = {
  queued: "waiting",
  running: "working",
  retrying: "working",
  verifying: "working",
  awaiting_input: "needs_approval",
  awaiting_approval: "needs_approval",
  paused: "waiting",
  blocked: "waiting",
  stopped: "finished",
  completed: "finished",
  // Some steps didn't run. That is not a finished mission, whatever the engine
  // calls it — it needs a human to look.
  partial: "failed",
  failed: "failed",
};

export function statusOfMission(state: MissionRecord["state"]): LiveStatus {
  return FROM_MISSION[state] ?? "waiting";
}

/** How one step of a running task should read on a flow strip. */
export type StepMark = "done" | "current" | "upcoming" | "stopped" | "your_turn";

export function markOfStep(state: MissionStepState): StepMark {
  switch (state) {
    case "completed":
    case "skipped":
      return "done";
    case "running":
    case "verifying":
    case "retrying":
      return "current";
    case "failed":
    case "vetoed":
    case "canceled":
      return "stopped";
    case "awaiting_approval":
    case "awaiting_input":
      return "your_turn";
    default:
      return "upcoming";
  }
}
