import { getStore } from "../store";
import { getProvider } from "../integrations/registry";
import { heroResult } from "../missions/today";
import { outcomeSentence } from "../missions/narrate";
import type {
  AccountAuditRecord,
  ActionEventRecord,
  ActionRecord,
  MissionRecord,
} from "../types";
import type { ConnectionRecord } from "../integrations/types";

/**
 * One activity model. Everything reads from this; nothing keeps its own.
 *
 * Approvals, AI work, connection changes, policy changes and emergency stops
 * used to live in separate timelines with separate wording and separate
 * rendering, which meant the same moment could appear twice, described two
 * ways, in two places. Every page is now a FILTER over this one list.
 *
 * Each event answers exactly four things — what happened, where, who did it,
 * and can I open it — because those are the questions people actually have,
 * and anything else is the engine talking.
 *
 * Every event is DERIVED from a stored record. Nothing is written twice, so
 * there is no second history to fall out of sync with the first.
 */

export type ActivityKind =
  | "work"
  | "decision"
  | "connection"
  | "policy"
  | "safety";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  /** What happened, in a sentence. Never an event name. */
  headline: string;
  /** One line of context. Absent when there is nothing true to add. */
  detail?: string;
  /** Where it happened — an app name, or null for cosigno itself. */
  app: string | null;
  providerKey?: string;
  /** Who did it, in the reader's words. */
  actor: "cosigno" | "you";
  /** Where to go and look. Absent only when there is genuinely nowhere. */
  href?: string;
  /** Pinned to the top until resolved. */
  pinned?: boolean;
  /** For per-mission and per-app filtering. */
  missionId?: string;
  /**
   * The decision behind this event, when there is one. Carries the signed
   * receipt — the proof of what was authorised and by whom.
   */
  actionId?: string;
}

/* ------------------------------------------------------------ phrasing */

/**
 * Audit types are machine names. These are the sentences a person would say.
 *
 * A type with no sentence here is deliberately DROPPED rather than shown raw:
 * "objective_deleted" on a timeline is the engine talking, and a reader who
 * sees it learns nothing except that cosigno leaks its internals.
 */
const AUDIT_SENTENCE: Partial<
  Record<AccountAuditRecord["type"], (d: Record<string, unknown>) => string>
> = {
  integration_connected: (d) => `${String(d.provider ?? "An app")} connected.`,
  integration_disconnected: (d) => `${String(d.provider ?? "An app")} disconnected.`,
  tier_changed: (d) =>
    `${String(d.category ?? "An action type")} now needs ${
      d.tier === 3 ? "typed confirmation" : d.tier === 2 ? "your approval" : "no approval"
    }.`,
  rule_created: (d) => `New rule: ${String(d.text ?? "a permission rule was added")}`,
  rule_deleted: () => "A permission rule was removed.",
  emergency_stop: () => "You stopped all AI activity.",
  emergency_stop_lifted: () => "You resumed cosigno.",
  hold_changed: (d) =>
    d.scope === "none" ? "You resumed cosigno." : "You paused all AI activity.",
  automation_created: () => "A recurring job was set up.",
  automation_deleted: () => "A recurring job was removed.",
};

const POLICY_TYPES = new Set<AccountAuditRecord["type"]>([
  "tier_changed",
  "rule_created",
  "rule_deleted",
]);
const SAFETY_TYPES = new Set<AccountAuditRecord["type"]>([
  "emergency_stop",
  "emergency_stop_lifted",
  "hold_changed",
]);

/** The decision events worth a timeline row, in a person's words. */
function decisionSentence(
  event: ActionEventRecord,
  action: ActionRecord
): { headline: string; actor: ActivityEvent["actor"] } | null {
  switch (event.type) {
    case "proposed":
      return { headline: `Asked to ${action.summary}`, actor: "cosigno" };
    case "approved":
      return event.detail?.auto === true
        ? // Auto-approved tier-1 work is cosigno clearing its own low-risk
          // queue. Presenting it as "you approved" would credit a person with
          // a decision they never made.
          { headline: `Cleared automatically: ${action.summary}`, actor: "cosigno" }
        : { headline: `You approved: ${action.summary}`, actor: "you" };
    case "vetoed":
      return { headline: `You declined: ${action.summary}`, actor: "you" };
    case "executed":
      return {
        headline: outcomeSentence(
          typeof action.result?.summary === "string" ? action.result.summary : action.summary
        ),
        actor: "cosigno",
      };
    case "failed":
      return { headline: `Couldn't complete: ${action.summary}`, actor: "cosigno" };
    case "blocked":
      return { headline: `Held back: ${action.summary}`, actor: "cosigno" };
    // executing / edited / flagged are steps along the way, not moments worth
    // a row. A timeline that logs every transition is a log, not a story.
    default:
      return null;
  }
}

function appOfAction(action: ActionRecord): { app: string | null; providerKey?: string } {
  const p = action.payload ?? {};
  if (typeof p.repo === "string" || typeof (p.args as { repo?: string })?.repo === "string") {
    return { app: "GitHub", providerKey: "github" };
  }
  const key = typeof p.provider === "string" ? p.provider : null;
  const provider = key ? getProvider(key) : null;
  return provider ? { app: provider.name, providerKey: key! } : { app: null };
}

/* -------------------------------------------------------------- builder */

export interface ActivityFilterOptions {
  kinds?: ActivityKind[];
  missionId?: string;
  providerKey?: string;
  limit?: number;
}

export async function buildActivity(
  userId: string,
  options: ActivityFilterOptions = {}
): Promise<ActivityEvent[]> {
  const store = getStore();
  const limit = options.limit ?? 60;

  const [actions, missions, connections, audit] = await Promise.all([
    store.listActions(userId, { limit: 80 }).catch((): ActionRecord[] => []),
    store.listMissions(userId, 40).catch((): MissionRecord[] => []),
    store.listConnections(userId).catch((): ConnectionRecord[] => []),
    store.listAudit(userId, 60).catch((): AccountAuditRecord[] => []),
  ]);

  const events: ActivityEvent[] = [];

  // --- decisions + the work they authorised -------------------------------
  const byId = new Map(actions.map((a) => [a.id, a]));
  const actionEvents = await store
    .listEventsForActions(userId, actions.map((a) => a.id))
    .catch((): ActionEventRecord[] => []);

  for (const e of actionEvents) {
    const action = byId.get(e.action_id);
    if (!action) continue;
    const said = decisionSentence(e, action);
    if (!said) continue;
    const where = appOfAction(action);
    events.push({
      id: `event-${e.id}`,
      // An executed action is the work landing; everything else is the
      // decision about it.
      kind: e.type === "executed" ? "work" : "decision",
      at: e.created_at,
      headline: said.headline,
      app: where.app,
      ...(where.providerKey ? { providerKey: where.providerKey } : {}),
      actor: said.actor,
      actionId: action.id,
      // A card still waiting is the one thing on the page that costs the
      // reader something by scrolling past it.
      ...(e.type === "proposed" && action.status === "proposed"
        ? { pinned: true, href: "/app/approvals", detail: "waiting for your approval" }
        : {}),
    });
  }

  // --- missions reaching an end ------------------------------------------
  for (const m of missions) {
    if (!["completed", "partial", "failed", "stopped"].includes(m.state)) continue;
    const at = m.completed_at ?? m.updated_at;
    const hero = heroResult(m, undefined);
    events.push({
      id: `mission-${m.id}`,
      kind: "work",
      at,
      headline:
        m.state === "completed"
          ? (hero ?? `Finished: ${m.goal}`)
          : m.state === "stopped"
            ? `You stopped: ${m.goal}`
            : m.state === "partial"
              ? `Partly done: ${m.goal}`
              : `Didn't finish: ${m.goal}`,
      detail: hero && m.state === "completed" ? m.goal : undefined,
      app: null,
      actor: m.state === "stopped" ? "you" : "cosigno",
      href: `/app/missions/${m.id}`,
      missionId: m.id,
    });
  }

  // --- connections needing a person --------------------------------------
  for (const c of connections) {
    if (c.status !== "needs_reauth" && c.status !== "error") continue;
    events.push({
      id: `connection-${c.id}`,
      kind: "connection",
      at: c.last_health_at ?? c.updated_at,
      headline:
        c.status === "needs_reauth"
          ? `${c.display_name} needs reconnecting.`
          : `${c.display_name} isn't responding.`,
      app: c.display_name,
      ...(getProvider(c.provider_key) ? { providerKey: c.provider_key } : {}),
      actor: "cosigno",
      href: "/app/connections",
      // Broken connections stay up top: everything downstream of them is
      // silently not happening.
      pinned: true,
    });
  }

  // --- policy + safety ----------------------------------------------------
  for (const a of audit) {
    const say = AUDIT_SENTENCE[a.type];
    if (!say) continue;
    events.push({
      id: `audit-${a.id}`,
      kind: POLICY_TYPES.has(a.type) ? "policy" : SAFETY_TYPES.has(a.type) ? "safety" : "connection",
      at: a.created_at,
      headline: say(a.detail ?? {}),
      app: null,
      actor: SAFETY_TYPES.has(a.type) ? "you" : "cosigno",
      href: POLICY_TYPES.has(a.type) ? "/app/settings" : "/app/connections",
    });
  }

  // --- filter, then order -------------------------------------------------
  let filtered = events;
  if (options.kinds?.length) filtered = filtered.filter((e) => options.kinds!.includes(e.kind));
  if (options.missionId) filtered = filtered.filter((e) => e.missionId === options.missionId);
  if (options.providerKey) filtered = filtered.filter((e) => e.providerKey === options.providerKey);

  return filtered
    .sort((a, b) => {
      // Anything still waiting stays pinned above the stream, however old.
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return Date.parse(b.at) - Date.parse(a.at);
    })
    .slice(0, limit);
}
