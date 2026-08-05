import type { ActionRecord, MissionStepRecord } from "./types";
import { markOfStep } from "./status";
import { objectsFromAction } from "./objectView";

/**
 * The glass wall.
 *
 * Not a dashboard and not a graph — a room. One desk per app, each showing
 * who's working there, what they're doing right now, and when it was last
 * touched:
 *
 *     GitHub    ● working    cosigno is editing 3 files      2m ago
 *     Stripe    ○ idle       nothing right now              1h ago
 *     Slack     ◐ waiting    1 approval queued              4m ago
 *
 * TWO HONESTY RULES, because a fake heartbeat is worse than a still page:
 *
 *   1. A desk only says "working" when a step is genuinely running in that
 *      app. Idle says idle. The ambient breathing in the UI is atmosphere;
 *      the WORDS are always load-bearing.
 *   2. The worker is named from what actually did the work — cosigno for
 *      in-app missions, or the agent's own id where the ledger recorded one.
 *      No invented employee names.
 */

export type DeskState = "working" | "waiting" | "attention" | "idle";

export interface DeskItem {
  text: string;
  /** Where clicking leads — always somewhere real. */
  href?: string;
}

export interface Desk {
  key: string;
  name: string;
  state: DeskState;
  /** One line: what is happening at this desk. */
  now: string;
  /** Who is doing it. Null when nothing is. */
  worker: string | null;
  /** Last time real work touched this app. */
  last_activity_at: string | null;
  pending_approvals: number;
  /** What finished here recently, in plain words. */
  recent: DeskItem[];
  /** Connection health, when this desk is a real connection. */
  health: "connected" | "needs_attention" | "not_connected";
}

/** Tool namespaces and provider keys → the app a person would name. */
const APP_NAMES: Record<string, string> = {
  calendar: "Calendar",
  "google-calendar": "Calendar",
  gmail: "Email",
  google: "Email",
  inbox: "Email",
  outlook: "Email",
  drive: "Files",
  "google-drive": "Files",
  deliverable: "Files",
  files: "Files",
  github: "GitHub",
  slack: "Slack",
  notion: "Notion",
  browser: "The web",
  laptop: "The web",
};

const INTERNAL = new Set(["analyze", "mission", "chief", "plan", "compare", "summarize"]);

function appNameFor(key: string): string {
  return APP_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]+/g, " ");
}

function namespaceOf(tool: string): string {
  return tool.split(".")[0] ?? tool;
}

export interface DeskInput {
  /** Connected apps, from the connections list. */
  connections: { id: string; provider_key: string; display_name: string; status: string; kind: string }[];
  /** Every step of every active mission. */
  steps: MissionStepRecord[];
  /** Actions waiting for a human. */
  proposed: ActionRecord[];
  /** Recently executed actions, newest first. */
  recent: ActionRecord[];
  now?: number;
}

/** Which desk an action belongs to, by connection id or provider key. */
function deskOfAction(action: ActionRecord, byConnectionId: Map<string, string>): string | null {
  const p = action.payload ?? {};
  const connectionId = typeof p.connection_id === "string" ? p.connection_id : null;
  if (connectionId && byConnectionId.has(connectionId)) return byConnectionId.get(connectionId)!;
  const provider = typeof p.provider === "string" ? p.provider : null;
  return provider ?? null;
}

export function buildDesks(input: DeskInput): Desk[] {
  const now = input.now ?? Date.now();
  const desks = new Map<string, Desk>();
  /** connection id → desk key, so an action can find its desk. */
  const byConnectionId = new Map<string, string>();

  const ensure = (key: string, name: string, health: Desk["health"]): Desk => {
    const existing = desks.get(key);
    if (existing) return existing;
    const desk: Desk = {
      key,
      name,
      state: "idle",
      now: "nothing right now",
      worker: null,
      last_activity_at: null,
      pending_approvals: 0,
      recent: [],
      health,
    };
    desks.set(key, desk);
    return desk;
  };

  // Every connected app gets a desk, whether or not anything is happening at
  // it. An empty desk is information: that app is quiet.
  for (const c of input.connections) {
    const key = c.kind === "app" ? c.provider_key : c.id;
    byConnectionId.set(c.id, key);
    ensure(key, c.display_name || appNameFor(c.provider_key), c.status === "connected" ? "connected" : "needs_attention");
  }

  // Live work, from mission steps.
  for (const step of [...input.steps].sort((a, b) => a.idx - b.idx)) {
    const ns = namespaceOf(step.tool);
    if (INTERNAL.has(ns)) continue;
    const key = ns;
    const desk = ensure(key, appNameFor(ns), "connected");
    const mark = markOfStep(step.state);

    if (mark === "current") {
      desk.state = "working";
      desk.worker = "cosigno";
      desk.now = step.purpose;
    } else if (mark === "your_turn" && desk.state !== "working") {
      desk.state = "waiting";
      desk.now = `${step.purpose} — waiting for you`;
    } else if (mark === "done") {
      const at = step.completed_at ?? step.updated_at;
      if (!desk.last_activity_at || Date.parse(at) > Date.parse(desk.last_activity_at)) {
        desk.last_activity_at = at;
      }
      if (desk.recent.length < 3) desk.recent.push({ text: step.purpose });
    }
  }

  // Work waiting on a human.
  for (const action of input.proposed) {
    const key = deskOfAction(action, byConnectionId);
    if (!key) continue;
    const desk = desks.get(key);
    if (!desk) continue;
    desk.pending_approvals += 1;
    if (desk.state === "idle") {
      desk.state = "waiting";
      desk.now = "waiting for your approval";
    }
  }

  // What actually finished here, as the objects it changed.
  for (const action of input.recent) {
    const key = deskOfAction(action, byConnectionId);
    if (!key) continue;
    const desk = desks.get(key);
    if (!desk) continue;
    const at = action.resolved_at ?? action.created_at;
    if (!desk.last_activity_at || Date.parse(at) > Date.parse(desk.last_activity_at)) {
      desk.last_activity_at = at;
    }
    if (desk.recent.length >= 3) continue;
    const objects = objectsFromAction(action);
    const card = objects.cards[0];
    desk.recent.push({
      text: card ? `${card.type} ${card.name} — ${card.summary}`.trim() : action.summary,
      href: "/app/activity",
    });
  }

  // A connection that needs re-authorizing is the loudest thing in the room:
  // nothing can happen there until a person fixes it.
  for (const desk of desks.values()) {
    if (desk.health === "needs_attention") {
      desk.state = "attention";
      desk.now = "needs reconnecting before anything can run here";
    } else if (desk.state === "idle" && desk.last_activity_at) {
      desk.now = "nothing right now";
    }
  }

  const rank: Record<DeskState, number> = { attention: 0, working: 1, waiting: 2, idle: 3 };
  return [...desks.values()].sort(
    (a, b) => rank[a.state] - rank[b.state] || recency(b, now) - recency(a, now) || a.name.localeCompare(b.name)
  );
}

function recency(desk: Desk, now: number): number {
  return desk.last_activity_at ? -(now - Date.parse(desk.last_activity_at)) : -Infinity;
}

/** One line for the whole room, for the top of the page. */
export function roomSummary(desks: Desk[]): string {
  if (desks.length === 0) return "No apps connected yet.";
  const working = desks.filter((d) => d.state === "working").length;
  const waiting = desks.filter((d) => d.state === "waiting").length;
  const attention = desks.filter((d) => d.state === "attention").length;

  const parts: string[] = [];
  if (working > 0) parts.push(`working in ${working} app${working === 1 ? "" : "s"}`);
  if (waiting > 0) parts.push(`${waiting} waiting on you`);
  if (attention > 0) parts.push(`${attention} needs reconnecting`);
  if (parts.length === 0) return `All ${desks.length} apps are quiet.`;
  return `cosigno is ${parts.join(" · ")}.`;
}
