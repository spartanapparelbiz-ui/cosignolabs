import type {
  ActionRecord,
  AutomationRecord,
  MissionRecord,
  MissionStepRecord,
} from "../types";
import type { ConnectionView } from "../integrations/types";
import { agoLong } from "../time";
import { RUNNING_STATES, WAITING_STATES, isToday, relativeTime } from "./model";

/**
 * The briefing — the four or five sentences that replace "good morning."
 *
 * A greeting is a courtesy. A briefing is the reason to open the product at
 * all: it says what happened while you were away, what is now waiting on you,
 * and what it will cost to keep waiting. Someone should be able to read this
 * and close the laptop knowing they missed nothing.
 *
 * Everything here is DERIVED from records that exist. That constraint is what
 * makes a briefing worth reading — the moment one line is generated prose,
 * every other line has to be checked, and then none of them save any time.
 * So there is no "productivity score", no "you saved 42 minutes", no revenue
 * trend: cosigno cannot measure those, and a number on this screen is read as
 * a measurement.
 *
 * Ordering is the other half of the job. Lines are emitted in the order a day
 * actually needs them — what is blocked on you, what is degrading, what is
 * moving, what is done — because a briefing that buries the blocking item
 * under a status update is a status update.
 */

export type BriefingTone = "attention" | "degraded" | "progress" | "done" | "idle";

export interface BriefingLine {
  key: string;
  /** One sentence. Sentence case, no exclamation. */
  text: string;
  tone: BriefingTone;
  /** Where to go, or what to put in the ask box. Never both. */
  action?: { label: string; href?: string; compose?: string };
}

export interface Briefing {
  /** "good morning, nick" — the name only when we actually have one. */
  greeting: string;
  /**
   * The one line that would go in a text message. Absent when there is
   * genuinely nothing to report, which is itself worth saying plainly.
   */
  headline: string;
  lines: BriefingLine[];
}

/* ------------------------------------------------------------------ time */

function partOfDay(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "good morning";
  if (h < 18) return "good afternoon";
  return "good evening";
}

/** "2 days" / "3 hours" — the prose register from the one time vocabulary. */
export function ageOf(iso: string, now = new Date()): string {
  return agoLong(iso, now);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* -------------------------------------------------------------- progress */

/**
 * How far along a mission is, counted from step states.
 *
 * Returns null when there is nothing to count. A percentage is the most
 * quotable thing on this screen — "your launch is 82% complete" is repeated
 * to other people — so it is only ever produced from real completed steps,
 * never from elapsed time or step position.
 */
export function missionPercent(steps: MissionStepRecord[]): number | null {
  if (steps.length === 0) return null;
  const done = steps.filter((s) => s.state === "completed" || s.state === "skipped").length;
  return Math.round((done / steps.length) * 100);
}

/* -------------------------------------------------------------- the brief */

export interface BriefingInput {
  name: string;
  missions: MissionRecord[];
  steps: Record<string, MissionStepRecord[]>;
  approvals: ActionRecord[];
  connections: ConnectionView[];
  automations: AutomationRecord[];
  /** True when a hold is in force — it outranks every other line. */
  held?: boolean;
  now?: Date;
}

export function buildBriefing(input: BriefingInput): Briefing {
  const now = input.now ?? new Date();
  const { missions, steps, approvals, connections, automations } = input;
  const lines: BriefingLine[] = [];

  const name = input.name.trim();
  const greeting = name ? `${partOfDay(now)}, ${name}` : partOfDay(now);

  /* --- a hold stops everything, so it is said first and said plainly --- */
  if (input.held) {
    lines.push({
      key: "hold",
      tone: "attention",
      text: "Everything is on hold — nothing will execute until you lift it.",
      action: { label: "review the hold", href: "/app/trust" },
    });
  }

  /* --- what is blocked on you --- */
  if (approvals.length > 0) {
    // Oldest first: the cost of a waiting decision is the work stacked behind
    // it, and that cost is a function of how long it has been sitting.
    const oldest = [...approvals].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    )[0];
    const age = ageOf(oldest.created_at, now);
    lines.push({
      key: "approvals",
      tone: "attention",
      text:
        approvals.length === 1
          ? `One decision is waiting on you — it has been ${age}.`
          : `${plural(approvals.length, "decision")} are waiting on you — the oldest has been ${age}.`,
      action: { label: "review them", href: "/app/approvals" },
    });
  }

  const flagged = approvals.filter((a) => a.injection_flag);
  if (flagged.length > 0) {
    lines.push({
      key: "flagged",
      tone: "attention",
      text: `${plural(flagged.length, "action")} came from content that tried to direct cosigno — ${flagged.length === 1 ? "it is" : "they are"} locked until you re-issue ${flagged.length === 1 ? "it" : "them"} yourself.`,
      action: { label: "see what was held", href: "/app/approvals" },
    });
  }

  const stuck = missions.filter((m) => WAITING_STATES.has(m.state));
  if (stuck.length > 0) {
    const first = stuck[0];
    lines.push({
      key: "blocked",
      tone: "attention",
      text:
        stuck.length === 1
          ? `"${first.goal}" is stopped, waiting on you.`
          : `${plural(stuck.length, "mission")} are stopped, waiting on you.`,
      action: { label: "open it", href: `/app/missions/${first.id}` },
    });
  }

  /* --- what is degrading: quiet failures that cost you tomorrow --- */
  const broken = connections.filter(
    (c) => c.status === "needs_reauth" || c.status === "error"
  );
  if (broken.length > 0) {
    lines.push({
      key: "connections",
      tone: "degraded",
      text:
        broken.length === 1
          ? `${broken[0].display_name} stopped responding — reconnect it before anything tries to use it.`
          : `${plural(broken.length, "connected app")} stopped responding.`,
      action: { label: "reconnect", href: "/app/connections" },
    });
  }

  /* --- what is moving --- */
  const running = missions.filter((m) => RUNNING_STATES.has(m.state));
  if (running.length > 0) {
    const withPercent = running
      .map((m) => ({ m, pct: missionPercent(steps[m.id] ?? []) }))
      .filter((x): x is { m: MissionRecord; pct: number } => x.pct !== null)
      .sort((a, b) => b.pct - a.pct)[0];

    lines.push({
      key: "running",
      tone: "progress",
      text: withPercent
        ? `"${withPercent.m.goal}" is ${withPercent.pct}% complete.`
        : `cosigno is working on ${plural(running.length, "mission")}.`,
      action: { label: "watch it", href: `/app/missions/${(withPercent?.m ?? running[0]).id}` },
    });
  }

  /* --- what is coming --- */
  const scheduled = automations
    .filter((a) => a.enabled)
    .sort((a, b) => Date.parse(a.next_run_at) - Date.parse(b.next_run_at))[0];
  if (scheduled) {
    lines.push({
      key: "scheduled",
      tone: "progress",
      text: `Your "${scheduled.name}" rule runs ${relativeTime(scheduled.next_run_at, now)}.`,
      action: { label: "see standing work", href: "/app/watch" },
    });
  }

  /* --- what got done --- */
  const finishedToday = missions.filter(
    (m) =>
      (m.state === "completed" || m.state === "partial") &&
      isToday(m.completed_at ?? m.updated_at, now)
  );
  if (finishedToday.length > 0) {
    lines.push({
      key: "done",
      tone: "done",
      text: `cosigno finished ${plural(finishedToday.length, "mission")} today.`,
      action: { label: "see what happened", href: "/app/activity" },
    });
  }

  /* --- the workspace that cannot do anything yet --- */
  const connected = connections.filter((c) => c.status === "connected");
  if (connected.length === 0) {
    lines.push({
      key: "connect",
      tone: "idle",
      text: "cosigno isn't connected to anything yet, so it can only work with what you give it directly.",
      action: { label: "connect an app", href: "/app/connections" },
    });
  }

  /* ------------------------------------------------------------ headline */

  // The headline is the first line's subject, compressed. It is NOT a summary
  // of everything: a headline that tries to hold four facts holds none.
  const headline = headlineFor(lines, approvals.length, running.length, now);

  return { greeting, headline, lines: lines.slice(0, 5) };
}

function headlineFor(
  lines: BriefingLine[],
  approvals: number,
  running: number,
  now: Date
): string {
  const first = lines[0];
  if (!first) {
    // Genuinely nothing to report. Say that, rather than manufacturing a line
    // so the space isn't empty — an invented headline on a quiet morning is
    // how a briefing stops being believed.
    return now.getHours() < 12
      ? "Nothing needs you this morning."
      : "Nothing needs you right now.";
  }
  if (first.key === "hold") return "Everything is paused.";
  if (approvals > 0) {
    return approvals === 1
      ? "One decision, then cosigno can keep going."
      : `${approvals} decisions, then cosigno can keep going.`;
  }
  if (first.tone === "attention") return "Something is waiting on you.";
  if (first.tone === "degraded") return "One of your apps needs attention.";
  if (running > 0) return "Work is moving.";
  return "You're clear.";
}
