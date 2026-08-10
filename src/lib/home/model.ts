import type {
  ActionRecord,
  AutomationRecord,
  MissionRecord,
  MissionStepRecord,
} from "../types";
import type { ConnectionView } from "../integrations/types";
import { toProgressive } from "../missions/narrate";

/**
 * The operator home, as a pure view model.
 *
 * Home is the most-read screen in the product, so it is also the most
 * expensive place to be wrong — a confident line here is believed and acted
 * on without checking. Everything below is therefore derived from records
 * that exist, by total functions with no I/O, so the whole screen is
 * unit-testable and nothing on it can be summarised into existence.
 *
 * Two rules do most of the work:
 *
 *   1. **An unconnected source produces an invitation, never a metric.**
 *      "Unread email 0" is a measurement of an inbox cosigno cannot see. It
 *      reads as a fact and isn't one, so a tile with no source says what to
 *      connect instead of printing a zero.
 *   2. **A count is only shown when something counted it.** Mission progress
 *      comes from step states, "completed today" from completion timestamps,
 *      "waiting on you" from the real proposal queue. Nothing is estimated
 *      and then displayed as though it were measured.
 */

/* ------------------------------------------------------------ operator status */

export type OperatorState = "working" | "waiting" | "ready" | "held";

export interface OperatorStatus {
  state: OperatorState;
  /** Three or four words. Sits beside the live dot. */
  headline: string;
  /** One clause of supporting detail, or "" when there is nothing to add. */
  detail: string;
}

/** Mission states that mean work is genuinely moving right now. */
export const RUNNING_STATES = new Set([
  "queued",
  "running",
  "retrying",
  "verifying",
]);

/** Mission states that mean the mission is stopped, waiting on a human. */
export const WAITING_STATES = new Set([
  "awaiting_approval",
  "awaiting_input",
  "blocked",
  "paused",
]);

const FINISHED_STATES = new Set(["completed", "partial"]);

/** Same calendar day in the reader's own timezone. */
export function isToday(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What the operator is doing, in one line.
 *
 * Ordered by what costs the reader most to miss. A decision waiting on them
 * blocks everything behind it, so it outranks work in flight even when there
 * is more of the latter — and a hold outranks both, because under a hold
 * nothing at all will move no matter what the rest of the screen says.
 */
export function operatorStatus(
  missions: MissionRecord[],
  approvals: number,
  held = false
): OperatorStatus {
  if (held) {
    return {
      state: "held",
      headline: "everything is on hold",
      detail: "nothing will execute until you lift the hold",
    };
  }

  const running = missions.filter((m) => RUNNING_STATES.has(m.state)).length;
  const waiting = missions.filter((m) => WAITING_STATES.has(m.state)).length;

  if (approvals > 0) {
    return {
      state: "waiting",
      headline: `${plural(approvals, "decision")} waiting on you`,
      detail: running > 0 ? `${plural(running, "mission")} still running` : "nothing runs until you decide",
    };
  }
  if (waiting > 0) {
    return {
      state: "waiting",
      headline: `${plural(waiting, "mission")} needs you`,
      detail: running > 0 ? `${plural(running, "mission")} still running` : "",
    };
  }
  if (running > 0) {
    return {
      state: "working",
      headline: `working on ${plural(running, "mission")}`,
      detail: "you'll be asked before anything leaves your workspace",
    };
  }
  return {
    state: "ready",
    headline: "ready",
    detail: "nothing is running, and nothing is waiting on you",
  };
}

/* ------------------------------------------------------------------- tiles */

export type TileKey =
  | "running"
  | "approvals"
  | "completed"
  | "apps"
  | "scheduled"
  | "files"
  | "inbox"
  | "calendar";

export interface TodayTile {
  key: TileKey;
  label: string;
  /** The measured number. null means "not measurable here" — see `invite`. */
  value: number | null;
  /** One short line under the number. */
  meta?: string;
  /**
   * Shown INSTEAD of a number when there is no source to count. Always says
   * what would put a number here.
   */
  invite?: string;
  href: string;
  /** Fills the ask box instead of navigating. Used by the ask-shaped tiles. */
  compose?: string;
  attention?: boolean;
}

export interface TileInputs {
  missions: MissionRecord[];
  approvals: number;
  connections: ConnectionView[];
  automations: AutomationRecord[];
  files: number;
  now?: Date;
}

/** Whether an app is connected and healthy enough to be asked for anything. */
function hasApp(connections: ConnectionView[], prefix: string): boolean {
  return connections.some(
    (c) => c.provider_key.startsWith(prefix) && c.status === "connected"
  );
}

/**
 * Today, as tiles.
 *
 * The first six are counted from records. The last two — inbox and calendar —
 * are deliberately NOT counts: cosigno would have to call Gmail and Calendar
 * on every home render to produce them, so the honest tile offers the one-tap
 * mission that answers the question instead of printing a number nobody
 * measured. Unconnected, they invite the connection that would make the
 * question answerable at all.
 */
export function todayTiles(input: TileInputs): TodayTile[] {
  const { missions, approvals, connections, automations, files } = input;
  const now = input.now ?? new Date();

  const running = missions.filter((m) => RUNNING_STATES.has(m.state)).length;
  const completedToday = missions.filter(
    (m) => FINISHED_STATES.has(m.state) && isToday(m.completed_at ?? m.updated_at, now)
  ).length;
  const connected = connections.filter((c) => c.status === "connected").length;
  const needsAttention = connections.filter(
    (c) => c.status === "needs_reauth" || c.status === "error"
  ).length;
  const scheduled = automations.filter((a) => a.enabled).length;
  const nextRun = automations
    .filter((a) => a.enabled)
    .map((a) => a.next_run_at)
    .sort()[0];

  const mail = hasApp(connections, "google") || hasApp(connections, "outlook");
  const cal = hasApp(connections, "google-calendar") || hasApp(connections, "outlook");

  return [
    {
      key: "running",
      label: "running",
      value: running,
      meta: running > 0 ? `${running === 1 ? "mission" : "missions"} in flight` : "nothing in flight",
      href: "/app/missions",
    },
    {
      key: "approvals",
      label: "waiting on you",
      value: approvals,
      meta: approvals > 0 ? "nothing runs until you decide" : "you're all caught up",
      href: "/app/approvals",
      attention: approvals > 0,
    },
    {
      key: "completed",
      label: "done today",
      value: completedToday,
      meta:
        completedToday > 0
          ? `${completedToday === 1 ? "mission" : "missions"} finished`
          : "nothing finished yet",
      href: "/app/activity",
    },
    {
      key: "apps",
      label: "connected apps",
      value: connected,
      meta:
        needsAttention > 0
          ? `${plural(needsAttention, "app")} needs reconnecting`
          : connected > 0
            ? "cosigno can work in these"
            : "connect one to unlock work",
      href: "/app/connections",
      attention: needsAttention > 0,
    },
    {
      key: "scheduled",
      label: "scheduled",
      value: scheduled,
      meta: scheduled > 0 && nextRun ? `next ${relativeTime(nextRun, now)}` : "no standing work",
      href: "/app/watch",
    },
    {
      key: "files",
      label: "files",
      value: files,
      meta: files > 0 ? "your missions produced these" : "nothing produced yet",
      href: "/app/files",
    },
    {
      key: "inbox",
      label: "inbox",
      value: null,
      href: mail ? "/app" : "/app/connections",
      ...(mail
        ? { invite: "ask cosigno to review it", compose: "review my unread email" }
        : { invite: "connect gmail or outlook" }),
    },
    {
      key: "calendar",
      label: "calendar",
      value: null,
      href: cal ? "/app" : "/app/connections",
      ...(cal
        ? { invite: "ask cosigno to prepare it", compose: "prepare tomorrow's meeting" }
        : { invite: "connect your calendar" }),
    },
  ];
}

/** "in 20 minutes" / "in 3 hours" / "tomorrow" — never a raw timestamp. */
export function relativeTime(iso: string, now = new Date()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((t - now.getTime()) / 60_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${plural(mins, "minute")}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${plural(hours, "hour")}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${plural(days, "day")}`;
}

/* ---------------------------------------------------------------- missions */

export interface HomeMissionStep {
  idx: number;
  purpose: string;
  state: MissionStepRecord["state"];
}

export interface HomeMission {
  id: string;
  goal: string;
  state: string;
  /** What it is doing right now, as a phrase. null when it isn't doing anything. */
  doing: string | null;
  /** Counted step progress. null when the mission has no steps to count. */
  progress: { done: number; total: number } | null;
  /** The steps worth showing, newest work last. Capped. */
  steps: HomeMissionStep[];
  /** True when this mission is stopped, waiting on a person. */
  waiting: boolean;
}

const TERMINAL_STEP_STATES = new Set(["completed", "skipped"]);

/**
 * A running mission, reduced to what home shows: the goal, what it is doing,
 * and how far along it is.
 *
 * Progress is counted from step states and nothing else. A bar that moves
 * because time passed is a promise about work that isn't happening, and it is
 * the single fastest way to lose a person's trust in a screen like this.
 */
export function homeMission(
  mission: MissionRecord,
  steps: MissionStepRecord[] = [],
  stepLimit = 5
): HomeMission {
  const ordered = [...steps].sort((a, b) => a.idx - b.idx);
  const total = ordered.length;
  const done = ordered.filter((s) => TERMINAL_STEP_STATES.has(s.state)).length;
  const active = ordered.find((s) =>
    ["running", "verifying", "retrying"].includes(s.state)
  );

  // Show the work around the frontier: everything finished is behind you and
  // everything far ahead hasn't been decided yet, so a window centred on the
  // current step is the only part of a long plan worth the vertical space.
  const pivot = active ? ordered.indexOf(active) : done;
  const start = Math.max(0, Math.min(pivot - 1, Math.max(0, total - stepLimit)));

  return {
    id: mission.id,
    goal: mission.goal,
    state: mission.state,
    doing: active ? toProgressive(active.purpose) : null,
    progress: total > 0 ? { done, total } : null,
    steps: ordered.slice(start, start + stepLimit).map((s) => ({
      idx: s.idx,
      purpose: s.purpose,
      state: s.state,
    })),
    waiting: WAITING_STATES.has(mission.state),
  };
}

/* ------------------------------------------------------------------- apps */

export type AppHealth = "ok" | "attention" | "connecting" | "off";

export interface HomeApp {
  connectionId: string;
  providerKey: string;
  name: string;
  kind: "app" | "mcp" | "custom";
  health: AppHealth;
  /** Plain-English state — "working", "needs reconnecting". Never a code. */
  healthLabel: string;
  /** ISO timestamp of the last successful health check, when there was one. */
  lastCheckedAt: string | null;
}

const HEALTH: Record<string, { health: AppHealth; label: string }> = {
  connected: { health: "ok", label: "working" },
  needs_reauth: { health: "attention", label: "needs reconnecting" },
  error: { health: "attention", label: "not responding" },
  pending: { health: "connecting", label: "finishing setup" },
  disconnected: { health: "off", label: "disconnected" },
};

export function homeApps(connections: ConnectionView[]): HomeApp[] {
  return connections
    .map((c) => {
      const h = HEALTH[c.status] ?? { health: "off" as AppHealth, label: c.status };
      return {
        connectionId: c.id,
        providerKey: c.provider_key,
        name: c.display_name,
        kind: c.kind,
        health: h.health,
        healthLabel: h.label,
        lastCheckedAt: c.last_health_at,
      };
    })
    // Anything asking for attention first: a connector that stopped working is
    // the reason a mission will fail an hour from now.
    .sort((a, b) => {
      const rank = { attention: 0, connecting: 1, ok: 2, off: 3 };
      return rank[a.health] - rank[b.health] || a.name.localeCompare(b.name);
    });
}

/* ------------------------------------------------------------- suggestions */

export interface Suggestion {
  /** A single emoji. Decoration, and the only place the product uses one. */
  glyph: string;
  title: string;
  /** What cosigno would actually do, in one clause. */
  detail: string;
  /** The exact text put into the ask box. */
  prompt: string;
  /** Provider prefix this needs, when it needs one. */
  requires?: string;
}

/**
 * Every suggestion cosigno can make, and what each one needs to be real.
 *
 * A suggestion for an app you haven't connected is an advertisement, not a
 * suggestion — it fills the ask box with a request that will immediately fail.
 * So each one declares its requirement and `suggestionsFor` only offers the
 * ones that would work.
 */
const CATALOG: Suggestion[] = [
  {
    glyph: "📧",
    title: "clear my inbox",
    detail: "reads what's unread, drafts the replies, asks before sending",
    prompt: "review my unread email and draft replies",
    requires: "google",
  },
  {
    glyph: "🧠",
    title: "prepare tomorrow's meeting",
    detail: "pulls the invite, the thread and the files into one brief",
    prompt: "prepare tomorrow's meeting",
    requires: "google-calendar",
  },
  {
    glyph: "🔁",
    title: "follow up on silence",
    detail: "finds threads that went quiet and drafts the nudge",
    prompt: "follow up on unanswered threads",
    requires: "google",
  },
  {
    glyph: "🐙",
    title: "review open pull requests",
    detail: "summarises what's waiting and what's blocked",
    prompt: "summarise the open pull requests i need to look at",
    requires: "github",
  },
  {
    glyph: "📈",
    title: "research the field",
    detail: "reads the public sources and writes up what it found",
    prompt: "research the best option and write up what you find",
  },
  {
    glyph: "🚀",
    title: "plan a product launch",
    detail: "turns the goal into a plan with checkpoints you approve",
    prompt: "plan a product launch and tell me what you need from me",
  },
  {
    glyph: "📄",
    title: "read this for me",
    detail: "drop a file or a link above and ask a question about it",
    prompt: "read this and tell me what matters",
  },
];

/**
 * The suggestions worth showing this workspace, best first.
 *
 * Connected-app suggestions lead because they can actually run today; the
 * general ones fill the rest so a brand-new workspace still sees something it
 * can click.
 */
export function suggestionsFor(
  connections: ConnectionView[],
  limit = 4
): Suggestion[] {
  const connected = connections.filter((c) => c.status === "connected");
  const available = CATALOG.filter(
    (s) => !s.requires || connected.some((c) => c.provider_key.startsWith(s.requires!))
  );
  const specific = available.filter((s) => s.requires);
  const general = available.filter((s) => !s.requires);
  return [...specific, ...general].slice(0, limit);
}

/* ------------------------------------------------------------------- feed */

export interface FeedLine {
  id: string;
  /** done = it happened; waiting = it needs you; live = it's happening now. */
  kind: "done" | "waiting" | "live" | "app";
  text: string;
  at: string;
  href?: string;
  providerKey?: string | null;
}

/**
 * The operator feed: what cosigno has been doing, newest first.
 *
 * Built from the same records the rest of the page reads — proposals, mission
 * outcomes, connection changes — rather than a second event log that could
 * drift from them. Anything still waiting on a person floats to the top,
 * because it is the only kind of line here that costs something to miss.
 */
export function feedLines(
  actions: ActionRecord[],
  missions: MissionRecord[],
  limit = 8,
  now = new Date()
): FeedLine[] {
  const lines: FeedLine[] = [];

  for (const a of actions) {
    if (a.status === "proposed") {
      lines.push({
        id: `a-${a.id}`,
        kind: "waiting",
        text: a.summary,
        at: a.created_at,
        href: "/app/approvals",
      });
    } else if (a.status === "executed") {
      lines.push({
        id: `a-${a.id}`,
        kind: "done",
        text: a.summary,
        at: a.resolved_at ?? a.created_at,
        href: "/app/activity",
      });
    }
  }

  for (const m of missions) {
    if (RUNNING_STATES.has(m.state)) {
      lines.push({
        id: `m-${m.id}`,
        kind: "live",
        text: m.goal,
        at: m.updated_at,
        href: `/app/missions/${m.id}`,
      });
    } else if (FINISHED_STATES.has(m.state) && isToday(m.completed_at ?? m.updated_at, now)) {
      lines.push({
        id: `m-${m.id}`,
        kind: "done",
        text: m.goal,
        at: m.completed_at ?? m.updated_at,
        href: `/app/missions/${m.id}`,
      });
    }
  }

  const rank = { waiting: 0, live: 1, done: 2, app: 3 };
  return lines
    .sort((x, y) => rank[x.kind] - rank[y.kind] || Date.parse(y.at) - Date.parse(x.at))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ model */

export interface HomeModel {
  status: OperatorStatus;
  tiles: TodayTile[];
  missions: HomeMission[];
  apps: HomeApp[];
  suggestions: Suggestion[];
  feed: FeedLine[];
  approvalsCount: number;
  /** AI operations executed this billing cycle. 0 renders nothing. */
  opsThisCycle: number;
}
