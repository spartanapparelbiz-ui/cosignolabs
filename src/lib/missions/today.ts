import type { MissionRecord, MissionStepRecord } from "../types";
import { appForTool, isAccomplishment, outcomeSentence, toProgressive } from "./narrate";

/**
 * What the company got done today.
 *
 * The test this has to pass: someone opens cosigno after lunch and understands
 * the day in about five seconds. That budget is the whole design constraint —
 * it rules out counts of operations, progress bars, and anything that has to
 * be read twice. A handful of finished sentences is what survives.
 *
 * Every line comes from a recorded outcome. Nothing is summarised into
 * existence: a mission that finished without recording what it achieved says
 * so, rather than being given a satisfying sentence it didn't earn.
 */

export type DigestKind = "done" | "doing" | "waiting" | "failed";

export interface DigestLine {
  missionId: string;
  kind: DigestKind;
  /** One sentence. */
  text: string;
}

export interface TodayDigest {
  lines: DigestLine[];
  /** True when nothing at all happened today. */
  empty: boolean;
}

/** Same calendar day in the viewer's timezone. */
function isToday(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

interface ReceiptShape {
  completed_steps?: Array<{ purpose?: string; summary?: string | null }>;
}

/**
 * The one sentence a mission is remembered by.
 *
 * The LAST recorded outcome, not the first: missions build toward their result,
 * so the final thing achieved is the thing that happened. Bookkeeping is
 * skipped — "mission receipt written" is the single least interesting true
 * statement cosigno can make about a day's work.
 *
 * Returns null when nothing was recorded. The caller says so plainly instead of
 * inventing a headline, because a mission that quietly achieved nothing is
 * exactly the case where a confident summary does the most damage.
 */
export function heroFromSteps(steps: MissionStepRecord[]): string | null {
  const outcomes = [...steps]
    .sort((a, b) => a.idx - b.idx)
    .filter((s) => s.state === "completed" && isAccomplishment(s.tool))
    .map((s) => (typeof s.output?.summary === "string" ? s.output.summary.trim() : ""))
    .filter(Boolean);
  const last = outcomes[outcomes.length - 1];
  return last ? outcomeSentence(last) : null;
}

/** The same, for a finished mission whose steps aren't loaded. */
export function heroFromReceipt(mission: MissionRecord): string | null {
  const receipt = mission.receipt as ReceiptShape | null;
  const done = receipt?.completed_steps ?? [];
  const summaries = done
    .map((s) => (typeof s.summary === "string" ? s.summary.trim() : ""))
    .filter(Boolean)
    // The receipt records its own writing as a completed step. It is
    // bookkeeping and must never become the sentence a day is remembered by.
    .filter((s) => !/^mission receipt written/i.test(s));
  const last = summaries[summaries.length - 1];
  return last ? outcomeSentence(last) : null;
}

/** The best available hero sentence for a mission. */
export function heroResult(
  mission: MissionRecord,
  steps: MissionStepRecord[] | undefined
): string | null {
  return (steps && steps.length ? heroFromSteps(steps) : null) ?? heroFromReceipt(mission);
}

/** What a running mission is doing right now, in one phrase. */
function doingNow(steps: MissionStepRecord[]): string | null {
  const running = steps.find((s) =>
    ["running", "verifying", "retrying"].includes(s.state)
  );
  return running ? toProgressive(running.purpose) : null;
}

/** What a waiting mission is waiting for. */
function waitingFor(mission: MissionRecord, steps: MissionStepRecord[]): string {
  if (mission.pending_question?.question) return mission.pending_question.question;
  const waiting = steps.find((s) => s.state === "awaiting_approval");
  return waiting
    ? `Waiting for you to approve: ${waiting.purpose.toLowerCase()}`
    : "Waiting on your decision";
}

const FINISHED = new Set(["completed", "partial"]);
const WAITING = new Set(["awaiting_approval", "awaiting_input", "blocked"]);
const RUNNING = new Set(["queued", "running", "retrying", "verifying"]);

/**
 * Today, as a handful of sentences.
 *
 * Ordered by what a person needs first: what is stuck on them, then what is
 * moving, then what got finished. Anything waiting is the only thing on the
 * page that costs them something by being missed.
 */
export function todayDigest(
  missions: MissionRecord[],
  stepsByMission: Record<string, MissionStepRecord[]> = {},
  limit = 5,
  now = new Date()
): TodayDigest {
  const waiting: DigestLine[] = [];
  const doing: DigestLine[] = [];
  const done: DigestLine[] = [];

  for (const m of missions) {
    const steps = stepsByMission[m.id] ?? [];

    if (WAITING.has(m.state)) {
      waiting.push({ missionId: m.id, kind: "waiting", text: waitingFor(m, steps) });
      continue;
    }

    if (RUNNING.has(m.state)) {
      const phrase = doingNow(steps);
      doing.push({
        missionId: m.id,
        kind: "doing",
        // A queued mission genuinely isn't doing anything yet, and saying it is
        // would be the first small lie on the most-read screen.
        text: phrase ?? `Starting: ${m.goal}`,
      });
      continue;
    }

    // Finished work only counts toward TODAY. Yesterday's wins on today's
    // summary would quietly inflate every day that follows a busy one.
    if (FINISHED.has(m.state) && isToday(m.completed_at ?? m.updated_at, now)) {
      const hero = heroResult(m, steps);
      done.push({
        missionId: m.id,
        kind: "done",
        text: hero ?? `Finished: ${m.goal}`,
      });
      continue;
    }

    if (m.state === "failed" && isToday(m.completed_at ?? m.updated_at, now)) {
      done.push({
        missionId: m.id,
        kind: "failed",
        text: `Didn't finish: ${m.goal}`,
      });
    }
  }

  const lines = [...waiting, ...doing, ...done].slice(0, limit);
  return { lines, empty: lines.length === 0 };
}
