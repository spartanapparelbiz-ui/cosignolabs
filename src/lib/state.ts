import { signRequired } from "./sign";
import type {
  ActionCategory,
  ActionEventRecord,
  ActionRecord,
  AutomationRecord,
  HoldScope,
  MissionRecord,
  Tier,
} from "./types";
import { CATEGORIES } from "./types";

/**
 * The slice of an action the state/stream assembly actually reads. Full
 * ActionRecords satisfy it, but so does the store's projected ActionHead —
 * so polled endpoints never have to transfer payload/result JSON.
 */
export type StateAction = Pick<
  ActionRecord,
  "id" | "status" | "summary" | "category" | "tier"
>;

/**
 * Cosigno State — the live understanding of delegated work. Not a business
 * score, not analytics: the actual operational condition of everything the
 * user has handed to cosigno. Pure assembly over stored records so it is
 * deterministic and testable; /api/state is a thin loader around this.
 *
 * State answers: what is moving, what is waiting, what changed, what is
 * blocked, what is being watched, where is the user needed.
 */

/* --------------------------------------------------------------- momentum */

/** Human-readable movement — never a 0–100 rating. */
export type Momentum = "moving" | "waiting" | "needs_you" | "blocked" | "complete";

export const MOMENTUM_LABEL: Record<Momentum, string> = {
  moving: "Moving",
  waiting: "Waiting",
  needs_you: "Needs you",
  blocked: "Blocked",
  complete: "Complete",
};

const MOVING_STATES = new Set(["queued", "running", "retrying", "verifying"]);
const NEEDS_YOU_STATES = new Set(["awaiting_input", "awaiting_approval"]);
const BLOCKED_STATES = new Set(["failed", "blocked"]);

export function momentumOf(mission: Pick<MissionRecord, "state">): Momentum {
  if (MOVING_STATES.has(mission.state)) return "moving";
  if (NEEDS_YOU_STATES.has(mission.state)) return "needs_you";
  if (BLOCKED_STATES.has(mission.state)) return "blocked";
  if (mission.state === "completed" || mission.state === "partial") return "complete";
  return "waiting"; // paused / stopped
}

export interface MissionMomentum {
  id: string;
  goal: string;
  momentum: Momentum;
  updated_at: string;
}

/* ----------------------------------------------------------------- stream */

/**
 * One meaningful operational event. Not a notification, not a feed post —
 * a record of work moving, quiet by design.
 */
export interface StreamEvent {
  key: string;
  at: string;
  text: string;
  kind: "working" | "advanced" | "authorized" | "executed" | "handoff" | "held" | "shift";
  /** True when this event is (or created) a decision waiting on the user. */
  needs_you: boolean;
}

function eventText(e: ActionEventRecord, action: StateAction | undefined): StreamEvent | null {
  const summary = action?.summary ?? "an action";
  switch (e.type) {
    case "proposed":
      return {
        key: e.id,
        at: e.created_at,
        text: `Prepared: ${summary}`,
        kind: "handoff",
        needs_you: action?.status === "proposed",
      };
    case "approved": {
      const auth = (e.detail as { authorization?: { method?: string } }).authorization;
      if (auth?.method === "auto") return null; // routine tier-1 noise stays out
      return {
        key: e.id,
        at: e.created_at,
        text: `${auth?.method === "signed" ? "Signed" : "Approved"}: ${summary}`,
        kind: "authorized",
        needs_you: false,
      };
    }
    case "executed":
      return { key: e.id, at: e.created_at, text: `Completed: ${summary}`, kind: "executed", needs_you: false };
    case "vetoed":
      return { key: e.id, at: e.created_at, text: `Vetoed: ${summary}`, kind: "shift", needs_you: false };
    case "flagged":
      return {
        key: e.id,
        at: e.created_at,
        text: `Held for review: external content tried to direct "${summary}"`,
        kind: "held",
        needs_you: true,
      };
    case "blocked":
      return { key: e.id, at: e.created_at, text: `Blocked: ${summary}`, kind: "held", needs_you: false };
    default:
      return null; // executing/edited are mechanics, not meaning
  }
}

export function assembleStream(
  events: ActionEventRecord[],
  actions: StateAction[],
  missions: MissionRecord[],
  limit = 12
): StreamEvent[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const out: StreamEvent[] = [];

  for (const e of events) {
    const item = eventText(e, byId.get(e.action_id));
    if (item) out.push(item);
  }
  for (const m of missions) {
    const momentum = momentumOf(m);
    if (momentum === "moving") {
      out.push({
        key: `mission_${m.id}`,
        at: m.updated_at,
        text: `Cosigno is working on "${m.goal}"`,
        kind: "working",
        needs_you: false,
      });
    } else if (momentum === "complete" && m.completed_at) {
      out.push({
        key: `mission_done_${m.id}`,
        at: m.completed_at,
        text: `Mission complete: ${m.goal}`,
        kind: "executed",
        needs_you: false,
      });
    } else if (momentum === "needs_you") {
      out.push({
        key: `mission_needs_${m.id}`,
        at: m.updated_at,
        text: `"${m.goal}" is waiting on your decision`,
        kind: "handoff",
        needs_you: true,
      });
    }
  }

  return out
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

/* ----------------------------------------------------------------- replay */

/**
 * DELEGATION REPLAY — the operational history of one delegation, in order:
 * what was delegated, what cosigno prepared, where the boundary was
 * reached, what the user authorized, what executed, and what the outcome
 * was. Built ONLY from the audit record — concise operational evidence,
 * never hidden reasoning.
 */
export interface ReplayLine {
  at: string;
  text: string;
  kind: StreamEvent["kind"] | "delegated";
}

export function replayOf(
  events: ActionEventRecord[],
  actions: StateAction[],
  delegatedAt?: string,
  goal?: string
): ReplayLine[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const lines: ReplayLine[] = [];
  if (delegatedAt) {
    lines.push({ at: delegatedAt, text: `Delegation accepted: ${goal ?? "your objective"}`, kind: "delegated" });
  }
  for (const e of events) {
    const action = byId.get(e.action_id);
    if (!action) continue;
    if (e.type === "proposed" && signRequired(action.category, action.tier)) {
      // The boundary moment is worth naming explicitly in a replay.
      lines.push({ at: e.created_at, text: `Boundary reached: "${action.summary}" needs your signature`, kind: "handoff" });
      continue;
    }
    const item = eventText(e, action);
    if (item) lines.push({ at: item.at, text: item.text, kind: item.kind });
  }
  return lines.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/* --------------------------------------------------------- state assembly */

export interface CosignoState {
  /** The four honest counts — the actual state of delegated work. */
  moving: number;
  need_you: number;
  watching: number;
  blocked: number;
  missions: MissionMomentum[];
  stream: StreamEvent[];
  /** Operational memory: honest observations from the record, never hidden reasoning. */
  notes: string[];
  /** Earned-autonomy offers: repeated one-click approvals cosigno could take over — only ever expanded by the user's explicit yes. */
  autonomy: AutonomyOffer[];
  /** The authority brake: none / external / all. Presence and NOW reflect it. */
  hold: HoldScope;
}

export interface StateInputs {
  missions: MissionRecord[];
  /** All actions (any status) — proposals and event context both come from here. */
  actions: StateAction[];
  automations: AutomationRecord[];
  events: ActionEventRecord[];
  /** Current effective tier per category (from the user's tier settings). */
  tiers?: Partial<Record<ActionCategory, Tier>>;
  /** Current Cosigno Hold scope. */
  hold?: HoldScope;
}

export function assembleState(inputs: StateInputs): CosignoState {
  const { missions, actions, automations, events, tiers, hold } = inputs;
  const proposals = actions.filter((a) => a.status === "proposed");

  const missionMomentum: MissionMomentum[] = missions.map((m) => ({
    id: m.id,
    goal: m.goal,
    momentum: momentumOf(m),
    updated_at: m.updated_at,
  }));

  const moving = missionMomentum.filter((m) => m.momentum === "moving").length;
  const blocked = missionMomentum.filter((m) => m.momentum === "blocked").length;
  const missionNeeds = missionMomentum.filter((m) => m.momentum === "needs_you").length;
  const watching = automations.filter((a) => a.enabled).length;

  return {
    moving,
    // Decisions waiting = proposed action cards + missions paused on the user.
    need_you: proposals.length + missionNeeds,
    watching,
    blocked,
    missions: missionMomentum,
    stream: assembleStream(events, actions, missions),
    notes: operationalNotes(events, actions),
    autonomy: autonomyOffers(events, actions, tiers),
    hold: hold ?? "none",
  };
}

/* --------------------------------------------------------- earned autonomy */

export interface AutonomyOffer {
  category: ActionCategory;
  label: string;
  /** How many times the user one-click-approved this category. */
  count: number;
}

const AUTONOMY_THRESHOLD = 5;

/**
 * Earned autonomy: cosigno notices repeated one-click approvals and OFFERS
 * to take the category over — it never expands its own authority. Offers
 * are strictly scoped:
 *  - only categories currently at tier 2 (approve),
 *  - never SIGN categories (external email, publishing, spend, webhooks),
 *  - never pinned tier-3 categories,
 *  - only after the user has approved the same category ≥5 times.
 * Accepting routes through the existing tier-settings door (reversible in
 * settings); declining is remembered client-side and costs nothing.
 */
export function autonomyOffers(
  events: ActionEventRecord[],
  actions: StateAction[],
  tiers?: Partial<Record<ActionCategory, Tier>>
): AutonomyOffer[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const counts = new Map<ActionCategory, number>();
  for (const e of events) {
    if (e.type !== "approved") continue;
    const method = (e.detail as { authorization?: { method?: string } }).authorization?.method;
    if (method !== "approved") continue;
    const category = byId.get(e.action_id)?.category;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const offers: AutonomyOffer[] = [];
  for (const [category, count] of counts) {
    if (count < AUTONOMY_THRESHOLD) continue;
    const meta = CATEGORIES[category];
    if (!meta || meta.pinned) continue;
    const current = tiers?.[category] ?? meta.defaultTier;
    if (current !== 2) continue; // already auto, or locked
    if (signRequired(category, 2)) continue; // deliberate actions never auto
    offers.push({ category, label: meta.label.toLowerCase(), count });
  }
  return offers.sort((a, b) => b.count - a.count).slice(0, 2);
}

/* ----------------------------------------------------- operational memory */

const CATEGORY_PHRASE: Record<string, string> = {
  send_email: "external emails",
  post_content: "published posts",
  update_record: "record updates",
  spend: "spend actions",
  webhook: "webhooks",
  delete: "deletions",
  refund: "refunds",
  payment: "payments",
};

/**
 * Honest observations derived only from the audit record — what the user
 * actually did, stated plainly. No hidden reasoning, no inference beyond
 * counting. Shown during handoffs so decisions come with real context.
 */
export function operationalNotes(events: ActionEventRecord[], actions: StateAction[]): string[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const signed = new Map<string, number>();
  const approved = new Map<string, number>();
  let vetoes = 0;

  for (const e of events) {
    const category = byId.get(e.action_id)?.category;
    if (!category) continue;
    if (e.type === "approved") {
      const method = (e.detail as { authorization?: { method?: string } }).authorization?.method;
      if (method === "signed") signed.set(category, (signed.get(category) ?? 0) + 1);
      else if (method === "approved") approved.set(category, (approved.get(category) ?? 0) + 1);
    } else if (e.type === "vetoed") {
      vetoes += 1;
    }
  }

  const notes: string[] = [];
  for (const [category, count] of [...signed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    if (count >= 2) {
      notes.push(`You've signed ${count} ${CATEGORY_PHRASE[category] ?? category} so far — cosigno always prepares these for your signature.`);
    }
  }
  for (const [category, count] of [...approved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1)) {
    if (count >= 3) {
      notes.push(`You normally approve ${CATEGORY_PHRASE[category] ?? category} with one click (${count} times).`);
    }
  }
  if (vetoes >= 2) {
    notes.push(`You've vetoed ${vetoes} prepared actions — cosigno treats a veto as final and never retries on its own.`);
  }
  return notes.slice(0, 3);
}
