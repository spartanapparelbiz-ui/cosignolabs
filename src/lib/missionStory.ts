import type { MissionRecord, MissionStepRecord } from "./types";
import { markOfStep, statusOfMission, type LiveStatus, type StepMark } from "./status";
import { objectsFromResult, type ObjectCard } from "./objectView";

/**
 * A mission, told as a story.
 *
 * A list of steps with states is a task list. What a person actually wants to
 * know is: what did AI do, which of my systems did it touch, what changed, and
 * is it really finished? So every mission renders as
 *
 *     Delete repository                                    finished · 2m ago
 *     ✓ Repository archived   ✓ Branches removed   ✓ Team notified
 *     GitHub → Files → Slack
 *
 * Everything here is derived from real step records — purposes the planner
 * wrote, outputs the tools returned, verifications the engine actually ran.
 *
 * ONE THING THIS DELIBERATELY DOES NOT PRODUCE: "time saved". cosigno knows how
 * long the work TOOK; it has no idea how long it would have taken a person, and
 * a made-up baseline on a results screen is the most flattering possible lie.
 * The story reports real elapsed time and nothing else.
 */

/* ------------------------------------------------------------------ apps */

/**
 * Tool namespaces → the place a person would say the work happened. The
 * namespace is real (it's how the engine routes the step); the display name is
 * the human word for it.
 */
const APP_NAMES: Record<string, string> = {
  calendar: "Calendar",
  gmail: "Email",
  inbox: "Email",
  mail: "Email",
  outlook: "Email",
  drive: "Files",
  deliverable: "Files",
  files: "Files",
  github: "GitHub",
  slack: "Slack",
  notion: "Notion",
  stripe: "Payments",
  browser: "The web",
  laptop: "The web",
};

/** Work cosigno does in its own head — not an app, and not shown as one. */
const INTERNAL = new Set(["analyze", "mission", "chief", "plan", "compare", "summarize"]);

export interface MissionApp {
  key: string;
  name: string;
  /** How this app's part of the work is going. */
  mark: StepMark;
  /** The steps that happened in this app, in order. */
  steps: { id: string; purpose: string; mark: StepMark; detail: string | null }[];
}

function namespaceOf(tool: string): string {
  return tool.split(".")[0] ?? tool;
}

/** The worst-first mark for a group of steps — one app, one state. */
function groupMark(marks: StepMark[]): StepMark {
  if (marks.includes("stopped")) return "stopped";
  if (marks.includes("current")) return "current";
  if (marks.includes("your_turn")) return "your_turn";
  if (marks.length > 0 && marks.every((m) => m === "done")) return "done";
  return "upcoming";
}

/** What a completed step actually produced, in one short phrase. */
function detailOf(step: MissionStepRecord): string | null {
  const output = step.output ?? {};
  const summary = output.summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  if (typeof output.file_id === "string") {
    const name = typeof output.name === "string" ? output.name : "a file";
    return `saved ${name}`;
  }
  if (step.error) return step.error;
  return null;
}

/**
 * The apps this mission moves through, in the order it reaches them. cosigno's
 * own thinking steps are folded into a leading "cosigno" box rather than being
 * listed as if they were a third-party system.
 */
export function missionApps(steps: readonly MissionStepRecord[]): MissionApp[] {
  const order: string[] = [];
  const byApp = new Map<string, MissionStepRecord[]>();

  for (const step of [...steps].sort((a, b) => a.idx - b.idx)) {
    const ns = namespaceOf(step.tool);
    const key = INTERNAL.has(ns) ? "cosigno" : ns;
    if (!byApp.has(key)) {
      byApp.set(key, []);
      order.push(key);
    }
    byApp.get(key)!.push(step);
  }

  return order.map((key) => {
    const group = byApp.get(key)!;
    const stepViews = group.map((s) => ({
      id: s.id,
      purpose: s.purpose,
      mark: markOfStep(s.state),
      detail: detailOf(s),
    }));
    return {
      key,
      name: key === "cosigno" ? "cosigno" : APP_NAMES[key] ?? titleize(key),
      mark: groupMark(stepViews.map((s) => s.mark)),
      steps: stepViews,
    };
  });
}

function titleize(s: string): string {
  const words = s.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ----------------------------------------------------------------- story */

export interface MissionStory {
  status: LiveStatus;
  /** One sentence: what this mission is, and where it got to. */
  headline: string;
  /** ✓ lines — the things that actually happened, in order. */
  done: string[];
  /** Real objects the work changed, across every step. */
  changes: ObjectCard[];
  apps: MissionApp[];
  /** Steps that needed a human decision. */
  approvals: number;
  /** Files the mission produced. */
  files: number;
  /** How long it actually took. Null while it is still running. */
  took: string | null;
  /** What is happening right now, when something is. */
  now: string | null;
  /** The closing sentence — outcome, or what stopped it. */
  outcome: string;
  /** True when at least one step's result was checked, not just sent. */
  verified: boolean;
  /** Steps that ran but could not be verified — stated, never glossed. */
  unverified: number;
}

function elapsed(steps: readonly MissionStepRecord[]): string | null {
  const starts = steps.map((s) => s.started_at).filter((v): v is string => Boolean(v));
  const ends = steps.map((s) => s.completed_at).filter((v): v is string => Boolean(v));
  if (starts.length === 0 || ends.length === 0) return null;
  const from = Math.min(...starts.map((s) => Date.parse(s)));
  const to = Math.max(...ends.map((s) => Date.parse(s)));
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

/** Did the engine actually check this step's result? */
function verificationOf(step: MissionStepRecord): { checked: boolean; ok: boolean } {
  const v = step.verification;
  if (!v || typeof v !== "object") return { checked: false, ok: false };
  return { checked: true, ok: v.ok === true };
}

export function buildMissionStory(
  mission: Pick<MissionRecord, "goal" | "state">,
  steps: readonly MissionStepRecord[]
): MissionStory {
  const ordered = [...steps].sort((a, b) => a.idx - b.idx);
  const status = statusOfMission(mission.state);
  const apps = missionApps(ordered);

  const completed = ordered.filter((s) => markOfStep(s.state) === "done");
  const done = completed.map((s) => {
    const detail = detailOf(s);
    return detail && detail !== s.purpose ? `${s.purpose} — ${detail}` : s.purpose;
  });

  const changes = completed.flatMap((s) => objectsFromResult(s.output).cards).slice(0, 12);
  const files = completed.filter((s) => typeof s.output?.file_id === "string").length;
  const approvals = ordered.filter((s) => s.action_id !== null).length;

  const running = ordered.find((s) => markOfStep(s.state) === "current");
  const yourTurn = ordered.find((s) => markOfStep(s.state) === "your_turn");
  const stopped = ordered.find((s) => markOfStep(s.state) === "stopped");

  const checked = completed.map(verificationOf);
  const verified = checked.some((c) => c.checked && c.ok);
  const unverified = completed.length - checked.filter((c) => c.checked && c.ok).length;

  return {
    status,
    headline: mission.goal,
    done,
    changes,
    apps,
    approvals,
    files,
    took: elapsed(ordered),
    now: running ? running.purpose : yourTurn ? `${yourTurn.purpose} — waiting for you` : null,
    outcome: outcomeOf(status, completed.length, ordered.length, stopped, unverified),
    verified,
    unverified,
  };
}

function outcomeOf(
  status: LiveStatus,
  doneCount: number,
  total: number,
  stopped: MissionStepRecord | undefined,
  unverified: number
): string {
  if (status === "failed") {
    return stopped
      ? `Stopped at "${stopped.purpose}"${stopped.error ? ` — ${stopped.error}` : ""}. Everything before it is done and was kept.`
      : "Some steps didn't run. Everything that finished was kept.";
  }
  if (status === "needs_approval") return "Waiting on you before it can go further.";
  if (status === "working") return `${doneCount} of ${total} steps done so far.`;
  if (status === "waiting") return "Not running right now.";
  if (doneCount === 0) return "Nothing ran.";
  if (unverified > 0) {
    return `All ${doneCount} steps finished. ${unverified} of them couldn't be checked afterwards, so cosigno is reporting them as sent rather than confirmed.`;
  }
  return `All ${doneCount} steps finished and were checked afterwards.`;
}
