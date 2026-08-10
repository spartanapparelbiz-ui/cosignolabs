import type { ActionRecord, MissionRecord, MissionStepRecord } from "../types";
import { toProgressive } from "./narrate";

/**
 * Mission replay — the recorded history of a mission, as a timeline you can
 * scrub.
 *
 * Everything on it is a timestamp that already exists: when the mission was
 * accepted, when each step started and finished, when a decision was put in
 * front of the user and when they made it. Nothing is reconstructed or
 * re-narrated by a model after the fact — a replay whose text could differ
 * between two viewings is a dramatization, and the audience for this surface
 * (audits, debugging, "why did it do that") needs a court record.
 *
 * Why replay matters at all: a finished mission's page shows the OUTCOME, and
 * outcomes hide the shape of the work. The receipt says three drafts were
 * written; the replay shows the mission stalled for two days in the middle —
 * on a decision, not on the work — which is the single most common answer to
 * "why did this take so long" and invisible everywhere else.
 *
 * Pure and total. The caller supplies the records; nothing here does I/O.
 */

export type ReplayKind =
  | "accepted" // the mission began
  | "started" // a step began working
  | "finished" // a step completed
  | "boundary" // a decision was put in front of the user
  | "decided" // the user approved or vetoed
  | "stalled" // a gap where nothing happened — usually the real story
  | "ended"; // the mission reached a terminal state

export interface ReplayMoment {
  at: string;
  kind: ReplayKind;
  /** One line, past tense — this already happened. */
  text: string;
  /** The step this moment belongs to, when it belongs to one. */
  stepIdx?: number;
  /** Milliseconds since the mission was accepted. Drives the scrubber. */
  offsetMs: number;
}

export interface MissionReplay {
  moments: ReplayMoment[];
  /** Total recorded span, ms. Zero for a mission that never ran. */
  spanMs: number;
  /** The longest single gap, when one is worth naming. */
  longestStallMs: number;
}

/**
 * A gap must be at least this long — AND dominate the mission's span — before
 * the replay names it. Machines pause for seconds constantly; a "stall" line
 * on every scheduling hiccup would bury the two-day one that matters.
 */
const STALL_FLOOR_MS = 10 * 60_000;
const STALL_SHARE = 0.25;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** "2 days" / "3 hours" / "12 minutes" for a stall label. */
export function spanLabel(msSpan: number): string {
  const mins = Math.round(msSpan / 60_000);
  // A fast mission is the good case — it must not read as "0 minutes",
  // which sounds like a recording failure rather than a quick run.
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

const TERMINAL_TEXT: Partial<Record<MissionRecord["state"], string>> = {
  completed: "the mission finished.",
  partial: "the mission ended with some of the work done and some not.",
  failed: "the mission stopped — it couldn't complete safely.",
  stopped: "you stopped the mission.",
};

/**
 * Build the replay.
 *
 * Moments come from three sources, then sort by time:
 *   - the mission record (accepted, ended),
 *   - each step's own started_at / completed_at,
 *   - each decision's created_at (boundary) and resolved_at (decided).
 * Stalls are derived LAST, from the assembled timeline — a stall is the
 * absence of moments, so it can only be found once they're all in order.
 */
export function buildReplay(
  mission: MissionRecord,
  steps: MissionStepRecord[],
  actions: ActionRecord[] = []
): MissionReplay {
  const accepted = ms(mission.created_at);
  if (accepted === null) return { moments: [], spanMs: 0, longestStallMs: 0 };

  const raw: Omit<ReplayMoment, "offsetMs">[] = [
    { at: mission.created_at, kind: "accepted", text: `you handed this to cosigno: "${mission.goal}"` },
  ];

  for (const s of [...steps].sort((a, b) => a.idx - b.idx)) {
    if (ms(s.started_at) !== null) {
      raw.push({
        at: s.started_at!,
        kind: "started",
        stepIdx: s.idx,
        text: `${toProgressive(s.purpose).toLowerCase()} began.`,
      });
    }
    if (ms(s.completed_at) !== null && (s.state === "completed" || s.state === "skipped")) {
      raw.push({
        at: s.completed_at!,
        kind: "finished",
        stepIdx: s.idx,
        text:
          s.state === "skipped"
            ? `"${s.purpose}" was skipped.`
            : `"${s.purpose}" finished.`,
      });
    }
  }

  for (const a of actions) {
    if (ms(a.created_at) !== null && a.tier >= 2) {
      raw.push({
        at: a.created_at,
        kind: "boundary",
        text: `cosigno stopped and asked: "${a.summary}"`,
      });
    }
    if (ms(a.resolved_at) !== null) {
      const verdict =
        a.status === "executed"
          ? "you approved it, and it executed"
          : a.status === "vetoed"
            ? "you vetoed it — it never ran"
            : a.status === "failed"
              ? "you approved it, but it didn't complete"
              : null;
      if (verdict) {
        raw.push({ at: a.resolved_at!, kind: "decided", text: `${verdict}.` });
      }
    }
  }

  const endedAt = ms(mission.completed_at);
  const endText = TERMINAL_TEXT[mission.state];
  if (endedAt !== null && endText) {
    raw.push({ at: mission.completed_at!, kind: "ended", text: endText });
  }

  const sorted = raw
    .map((m) => ({ ...m, offsetMs: (ms(m.at) ?? accepted) - accepted }))
    .filter((m) => m.offsetMs >= 0)
    .sort((a, b) => a.offsetMs - b.offsetMs);

  const spanMs = sorted.length ? sorted[sorted.length - 1].offsetMs : 0;

  // Stalls: the gaps between consecutive moments. Only the ones long enough
  // to be the story get a line of their own.
  const withStalls: ReplayMoment[] = [];
  let longestStallMs = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const gap = sorted[i].offsetMs - sorted[i - 1].offsetMs;
      longestStallMs = Math.max(longestStallMs, gap);
      if (gap >= STALL_FLOOR_MS && spanMs > 0 && gap / spanMs >= STALL_SHARE) {
        // The stall is attributed honestly: after a boundary moment the
        // mission was waiting on a person; otherwise we only know nothing
        // was recorded, and say exactly that.
        const cause =
          sorted[i - 1].kind === "boundary"
            ? "waiting on a decision"
            : "nothing was recorded";
        withStalls.push({
          at: sorted[i].at,
          kind: "stalled",
          offsetMs: sorted[i - 1].offsetMs + gap / 2,
          text: `${spanLabel(gap)} passed — ${cause}.`,
        });
      }
    }
    withStalls.push(sorted[i]);
  }

  return {
    moments: withStalls.sort((a, b) => a.offsetMs - b.offsetMs),
    spanMs,
    longestStallMs,
  };
}

/**
 * The replay's one-line verdict: where the time actually went.
 *
 * Only ever one of two claims, both checkable against the timeline below it:
 * the longest wait was on a person, or the mission ran start to finish. If
 * neither is clearly true, it says nothing.
 */
export function whereTimeWent(replay: MissionReplay): string | null {
  if (replay.spanMs <= 0 || replay.moments.length < 3) return null;
  const stall = replay.moments.find((m) => m.kind === "stalled");
  if (stall) {
    return `most of this mission's ${spanLabel(replay.spanMs)} was one gap: ${stall.text}`;
  }
  // The same detector that decides whether a gap deserves a line decides this
  // sentence: no nameable stall means the mission ran without one. Using a
  // second, stricter threshold here made the two claims disagree about the
  // same timeline.
  return `ran start to finish in ${spanLabel(replay.spanMs)} with no long waits.`;
}
