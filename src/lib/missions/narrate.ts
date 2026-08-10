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

/** Where a piece of work is happening — the app, as a person names it. */
export interface WorkApp {
  /** "GitHub", "Gmail". Null for cosigno's own work. */
  name: string | null;
  /** Connector key, for the logo. Null when there isn't one. */
  providerKey: string | null;
  /** "Engineering", "Finance" — how a business names this kind of work. */
  department: string | null;
}

/** A link to the real thing that was produced. */
export interface WorkProof {
  label: string;
  href: string;
  /** True when it leaves cosigno. */
  external: boolean;
}

/**
 * One entry in the work feed. Reads like a line in a conversation: when it
 * happened, which app it happened in, what happened, and how to go look at it.
 */
export interface WorkEntry {
  id: string;
  /** ISO timestamp, or null when the work hasn't started. */
  at: string | null;
  app: WorkApp;
  phase: StepPhase;
  /** The sentence a person reads. */
  headline: string;
  /** What it produced, when it produced something. */
  detail?: string;
  proof?: WorkProof;
  /** Why work stopped here. */
  blockedReason?: string;
}

/**
 * Which app a piece of work happens in, from the tool that does it.
 *
 * Derived from the tool prefix rather than stored, so a new tool lands in the
 * right place automatically. Anything cosigno does by itself — analysis,
 * writing a file, closing out — reports no app rather than borrowing one,
 * because claiming GitHub did cosigno's own bookkeeping would be a small lie
 * that makes the feed unreadable.
 */
const APP_BY_PREFIX: Record<string, Omit<WorkApp, "department">> = {
  github: { name: "GitHub", providerKey: "github" },
  gmail: { name: "Gmail", providerKey: "google" },
  inbox: { name: "Gmail", providerKey: "google" },
  followup: { name: "Gmail", providerKey: "google" },
  approval: { name: "Gmail", providerKey: "google" },
  calendar: { name: "Google Calendar", providerKey: "google-calendar" },
  drive: { name: "Google Drive", providerKey: "google-drive" },
  brief: { name: "Gmail", providerKey: "google" },
  browser: { name: "the web", providerKey: null },
  laptop: { name: "the web", providerKey: null },
};

/**
 * The kind of work an app is doing, named the way a business names it. GitHub
 * is where engineering happens; Gmail is where the inbox is.
 *
 * The department LEADS and the app name stays visible underneath — never
 * instead of it. Someone using GitHub for something other than engineering
 * must still be able to see which app actually did the thing, or a helpful
 * label becomes a misleading one.
 */
const DEPARTMENT_BY_PREFIX: Record<string, string> = {
  github: "Engineering",
  gmail: "Inbox",
  inbox: "Inbox",
  followup: "Inbox",
  approval: "Inbox",
  brief: "Inbox",
  calendar: "Schedule",
  drive: "Files",
  deliverable: "Files",
  browser: "Research",
  laptop: "Research",
  analyze: "Research",
};

export function appForTool(tool: string): WorkApp {
  const prefix = tool.split(".")[0];
  const base = APP_BY_PREFIX[prefix] ?? { name: null, providerKey: null };
  return { ...base, department: DEPARTMENT_BY_PREFIX[prefix] ?? null };
}

/**
 * Work that exists only because the engine needed it to. A mission receipt is
 * bookkeeping — it accomplishes nothing a person asked for, and a feed of
 * accomplishments that includes it is back to being a feed of operations.
 */
const BOOKKEEPING_TOOLS = new Set(["mission.receipt"]);

export function isAccomplishment(tool: string): boolean {
  return !BOOKKEEPING_TOOLS.has(tool);
}

/**
 * What a finished piece of work ACCOMPLISHED, rather than what it did.
 *
 * The tools already record outcomes — "opened issue #7 in owner/repo", "your 3
 * most recently pushed repositories: …" — so a completed entry leads with that
 * and drops the mechanic entirely. Work that hasn't finished has no outcome
 * yet, so it keeps its purpose: inventing an accomplishment for something
 * still running would be reporting a result before there is one.
 */
export function outcomeSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/**
 * A link to the thing that was actually made — the proof, one click away.
 *
 * Only ever built from a value the step really recorded. A "view it" button
 * that leads nowhere is worse than no button: it turns evidence into
 * decoration.
 */
export function proofFor(step: MissionStepRecord, app: WorkApp): WorkProof | undefined {
  const out = step.output ?? {};
  const url = typeof out.url === "string" ? out.url : undefined;
  if (url && /^https?:\/\//i.test(url)) {
    return { label: app.name ? `Open in ${app.name}` : "Open it", href: url, external: true };
  }
  if (typeof out.file_id === "string" && out.file_id) {
    return { label: "Open the file", href: "/app/files", external: false };
  }
  return undefined;
}

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

/**
 * Consecutive work in the same app, collapsed into one card.
 *
 * Six rows all labelled GitHub is noise the reader has to filter out
 * themselves; one GitHub card with three accomplishments under it is the same
 * information and reads at a glance. Only ADJACENT work merges — reordering to
 * group things that happened apart would misrepresent the sequence.
 */
export interface WorkGroup {
  key: string;
  app: WorkApp;
  entries: WorkEntry[];
}

export function groupFeed(feed: WorkEntry[]): WorkGroup[] {
  const groups: WorkGroup[] = [];
  for (const entry of feed) {
    const last = groups[groups.length - 1];
    const sameApp =
      last &&
      last.app.name === entry.app.name &&
      last.app.department === entry.app.department &&
      // Never fold work that has happened together with work that hasn't —
      // the boundary between done and still-to-come is the thing the reader
      // is looking for.
      (last.entries[last.entries.length - 1].phase === "upcoming") ===
        (entry.phase === "upcoming");
    if (sameApp) last.entries.push(entry);
    else groups.push({ key: entry.id, app: entry.app, entries: [entry] });
  }
  return groups;
}

export interface MissionNarration {
  steps: NarratedStep[];
  /**
   * The work feed, oldest first — everything that has happened, is happening,
   * or is still to come, as one continuous story.
   */
  feed: WorkEntry[];
  /** The feed, with consecutive same-app work merged into one card. */
  groups: WorkGroup[];
  /** What is happening right now, or what is waiting on a person. */
  nowWorking: WorkEntry | null;
  /**
   * The single next thing. Deliberately one: a list of five future items is a
   * plan, and nobody reads a plan — they want to know what follows this.
   */
  upNext: WorkEntry | null;
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
const DOUBLES = new Set(["run", "set", "put", "cut", "get", "plan", "stop", "begin", "submit", "scan", "drop", "ship", "log", "tag", "map", "wrap"]);

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

  const feed: WorkEntry[] = ordered
    // A feed of accomplishments has no room for the engine's own bookkeeping.
    .filter((s) => isAccomplishment(s.tool))
    .map((s) => {
      const app = appForTool(s.tool);
      const n = narrated.find((x) => x.id === s.id)!;
      // Finished work leads with what it ACCOMPLISHED. The tools already
      // record that, so the mechanic ("Read your repositories") is dropped
      // entirely rather than shown above the result. Unfinished work has no
      // outcome yet and keeps its purpose — inventing one would be reporting
      // a result before there is one.
      const headline =
        n.phase === "done" && n.evidence ? outcomeSentence(n.evidence) : n.headline;
      return {
        id: s.id,
        at: s.completed_at ?? s.started_at ?? null,
        app,
        phase: n.phase,
        headline,
        // Only kept when it isn't already the headline.
        ...(n.evidence && headline !== outcomeSentence(n.evidence)
          ? { detail: n.evidence }
          : {}),
        ...(proofFor(s, app) ? { proof: proofFor(s, app)! } : {}),
        ...(n.blockedReason ? { blockedReason: n.blockedReason } : {}),
      };
    });

  const current = narrated.find((n) => n.phase === "current") ?? null;
  const blocker = narrated.find((n) => n.phase === "needs_you") ?? null;
  // "Next" is the first thing that hasn't started — what happens after the
  // thing happening now, or after the decision being waited on.
  const next = narrated.find((n) => n.phase === "upcoming") ?? null;

  const doneCount = ordered.filter((s) => s.state === "completed").length;
  const total = ordered.length;

  const nowWorking =
    feed.find((e) => e.phase === "current") ?? feed.find((e) => e.phase === "needs_you") ?? null;

  return {
    steps: narrated,
    feed,
    groups: groupFeed(feed),
    nowWorking,
    upNext: feed.find((e) => e.phase === "upcoming") ?? null,
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
