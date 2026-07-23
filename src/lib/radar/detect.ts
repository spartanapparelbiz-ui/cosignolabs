import type {
  ActionRecord,
  AutomationRecord,
  MissionRecord,
  SubscriptionRecord,
} from "../types";
import type { ConnectionRecord } from "../integrations/types";
import { signRequired } from "../sign";
import type { RadarItem } from "./types";

/**
 * Cosigno Radar — deterministic detection over the user's OWN state. No LLM
 * is involved, so everything in `observed` is literally what the database
 * says; `inference` and `recommendation` are pure functions of those facts.
 * Radar NEVER executes: the strongest thing it can produce is a
 * `suggestedCommand` that "Prepare Mission" turns into an approval-gated card.
 *
 * Inputs are the caller's already-scoped rows (every list is fetched with the
 * authenticated user id), so there is no cross-tenant surface here.
 */

export interface RadarInputs {
  now: number;
  actions: ActionRecord[];
  missions: MissionRecord[];
  automations: AutomationRecord[];
  connections: ConnectionRecord[];
  subscription: SubscriptionRecord | null;
}

const DAY = 86_400_000;

function ageDays(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* --------------------------------------------------------------- detectors */

/** Proposed cards waiting on the user — the core "Needs You". */
function pendingApprovals(inp: RadarInputs): RadarItem[] {
  const proposed = inp.actions.filter(
    (a) => a.status === "proposed" && !a.injection_flag
  );
  if (proposed.length === 0) return [];

  // Group into one "needs you" item, plus a distinct "at risk" item for
  // anything aging past 3 days (a decision that's quietly rotting).
  const items: RadarItem[] = [];
  const signWorthy = proposed.filter((a) => signRequired(a.category, a.tier));
  items.push({
    key: "pending_approvals",
    category: "needs_you",
    title: proposed.length === 1 ? "A card is waiting for you" : `${proposed.length} cards are waiting for you`,
    observed: `${plural(proposed.length, "prepared action")} in the proposed state${
      signWorthy.length ? `, ${signWorthy.length} needing your signature` : ""
    }.`,
    source: "Your Missions & approvals (Cosigno)",
    why: "Prepared work only completes once you approve or sign it — nothing runs on its own.",
    inference: "These are ready to review; each still requires your explicit authorization.",
    recommendation: "Open Needs Me and approve, edit, or reject each card.",
    confidence: "high",
    involves: ["approvals"],
    suggestedTemplate: null,
    suggestedCommand: null,
    weight: 90 + Math.min(proposed.length, 9),
  });

  const stale = proposed.filter((a) => ageDays(a.created_at, inp.now) >= 3);
  if (stale.length > 0) {
    items.push({
      key: "stale_approvals",
      category: "at_risk",
      title: `${stale.length} decision${stale.length === 1 ? "" : "s"} aging out`,
      observed: `${plural(stale.length, "proposed card")} older than 3 days (cards expire after 7).`,
      source: "Your approvals (Cosigno)",
      why: "Proposed cards can't be approved once they pass the 7-day expiry — the plan would need rebuilding.",
      inference: "Left alone, these will expire and the prepared work is lost.",
      recommendation: "Decide on them now, or let them expire deliberately.",
      confidence: "high",
      involves: ["approvals"],
      suggestedTemplate: null,
      suggestedCommand: null,
      weight: 78,
    });
  }
  return items;
}

/** Missions that stopped moving (awaiting input, or stuck a long time). */
function stalledMissions(inp: RadarInputs): RadarItem[] {
  const items: RadarItem[] = [];
  for (const m of inp.missions) {
    if (m.state === "awaiting_input" && m.pending_question) {
      items.push({
        key: `mission_awaiting_${m.id}`,
        category: "needs_you",
        title: "A mission is waiting on your answer",
        observed: `"${m.goal}" is paused on a question: ${m.pending_question.question}`,
        source: "Your Missions (Cosigno)",
        why: m.pending_question.why || "The mission can't choose safely without you.",
        inference: "The mission will stay paused until you answer — no default is assumed.",
        recommendation: "Open the mission and answer the question to continue.",
        confidence: "high",
        involves: ["missions"],
        suggestedTemplate: null,
        suggestedCommand: null,
        weight: 85,
      });
    } else if (
      ["queued", "running", "retrying", "paused"].includes(m.state) &&
      ageDays(m.updated_at, inp.now) >= 2
    ) {
      items.push({
        key: `mission_stalled_${m.id}`,
        category: "forgotten",
        title: "A mission has stopped moving",
        observed: `"${m.goal}" is ${m.state} and hasn't advanced in ${plural(
          ageDays(m.updated_at, inp.now),
          "day"
        )}.`,
        source: "Your Missions (Cosigno)",
        why: "A project that stalls usually needs a nudge, an answer, or a decision to close it out.",
        inference: "Nothing is blocking safety here — it simply hasn't progressed.",
        recommendation: "Reopen the mission to resume it, or stop it if it's no longer needed.",
        confidence: "medium",
        involves: ["missions"],
        suggestedTemplate: null,
        suggestedCommand: null,
        weight: 60,
      });
    }
  }
  return items;
}

/** Failed/partial missions worth a retry decision. */
function failedMissions(inp: RadarInputs): RadarItem[] {
  return inp.missions
    .filter((m) => (m.state === "failed" || m.state === "partial") && ageDays(m.updated_at, inp.now) <= 14)
    .map((m) => ({
      key: `mission_failed_${m.id}`,
      category: "at_risk" as const,
      title: m.state === "failed" ? "A mission failed" : "A mission finished partially",
      observed: `"${m.goal}" ended ${m.state}${m.error ? ` — ${m.error}` : ""}.`,
      source: "Your Missions (Cosigno)",
      why: "A failed mission may have left work half-done that still needs finishing.",
      inference: "Cosigno stopped safely; nothing consequential ran without approval.",
      recommendation: "Review what completed, then decide whether to retry the remaining steps.",
      confidence: "high" as const,
      involves: ["missions"],
      suggestedTemplate: null,
      suggestedCommand: null,
      weight: 65,
    }));
}

/** Connections that need re-authentication (a silent break). */
function brokenConnections(inp: RadarInputs): RadarItem[] {
  return inp.connections
    .filter((c) => c.status === "needs_reauth" || c.status === "error")
    .map((c) => ({
      key: `conn_broken_${c.id}`,
      category: "at_risk" as const,
      title: `${c.display_name} needs reconnecting`,
      observed: `The ${c.display_name} connection is in "${c.status}" state.`,
      source: `${c.display_name} (connection health)`,
      why: "While a connection is broken, any mission that relies on it can't complete its real steps.",
      inference: "The stored authorization expired or was revoked upstream — this is a status fact, not a guess.",
      recommendation: `Reconnect ${c.display_name} from Connections.`,
      confidence: "high" as const,
      involves: [c.provider_key],
      suggestedTemplate: null,
      suggestedCommand: null,
      weight: 70,
    }));
}

/** Repetitive manual behavior that could become an automation (routine). */
function routineOpportunities(inp: RadarInputs): RadarItem[] {
  // Count executed/proposed actions by category over the recent window.
  const recent = inp.actions.filter((a) => ageDays(a.created_at, inp.now) <= 30);
  const byCategory = new Map<string, number>();
  for (const a of recent) byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1);

  const items: RadarItem[] = [];
  for (const [category, count] of byCategory) {
    if (count < 5) continue;
    // Don't suggest automating locked/outward money actions.
    if (["payment", "refund", "delete", "spend"].includes(category)) continue;
    const alreadyAutomated = inp.automations.some((au) =>
      au.command.toLowerCase().includes(category.replace("_", " "))
    );
    if (alreadyAutomated) continue;
    items.push({
      key: `routine_${category}`,
      category: "routine",
      title: `You repeat "${category.replace("_", " ")}" a lot`,
      observed: `${plural(count, category.replace("_", " ") + " action")} in the last 30 days.`,
      source: "Your activity history (Cosigno)",
      why: "Repeated manual work is a candidate for a recurring mission — still approval-gated, just prepared for you.",
      inference: "A pattern in your own history, not a prediction about the future.",
      recommendation: "Consider a recurring mission that prepares this work on a schedule.",
      confidence: "low",
      involves: ["automations"],
      suggestedTemplate: null,
      suggestedCommand: null,
      weight: 30,
    });
  }
  return items;
}

/** Billing state that deserves attention (past due / cancel scheduled). */
function billingSignals(inp: RadarInputs): RadarItem[] {
  const sub = inp.subscription;
  if (!sub) return [];
  const items: RadarItem[] = [];
  if (sub.status === "past_due") {
    items.push({
      key: "billing_past_due",
      category: "at_risk",
      title: "Your subscription is past due",
      observed: "Stripe reported a failed payment on your subscription.",
      source: "Billing (Stripe, verified server-side)",
      why: "A lapsed subscription drops you to the free plan and its lower limits.",
      inference: "This is verified subscription state, not a marketing nudge.",
      recommendation: "Update your payment method in the billing portal.",
      confidence: "high",
      involves: ["billing"],
      suggestedTemplate: null,
      suggestedCommand: null,
      weight: 72,
    });
  }
  if (sub.cancel_at_period_end && sub.current_period_end) {
    const days = Math.ceil((sub.current_period_end * 1000 - inp.now) / DAY);
    if (days >= 0 && days <= 14) {
      items.push({
        key: "billing_cancel_soon",
        category: "waiting",
        title: "Your plan ends soon",
        observed: `Your subscription is set to cancel in ${plural(days, "day")}.`,
        source: "Billing (Stripe, verified server-side)",
        why: "After it ends you'll return to the free plan.",
        inference: "You chose to cancel — this is a reminder, not a reversal.",
        recommendation: "Resume the plan from billing if you didn't mean to cancel.",
        confidence: "high",
        involves: ["billing"],
        suggestedTemplate: null,
        suggestedCommand: null,
        weight: 40,
      });
    }
  }
  return items;
}

/** A gentle opportunity: nothing connected yet. */
function onboardingOpportunity(inp: RadarInputs): RadarItem[] {
  if (inp.connections.length > 0) return [];
  return [
    {
      key: "connect_first_app",
      category: "opportunity",
      title: "Connect an app to unlock real missions",
      observed: "No connected apps yet.",
      source: "Connections (Cosigno)",
      why: "With an app connected, missions can do real work — still only after your approval.",
      inference: "This is about capability, not a claim that anything is wrong.",
      recommendation: "Connect Gmail, Calendar, or another app from Connections.",
      confidence: "high",
      involves: ["connections"],
      suggestedTemplate: null,
      suggestedCommand: null,
      weight: 20,
    },
  ];
}

/**
 * Genuinely-preparable opportunities: a connected inbox/calendar the user
 * hasn't put on a daily rail yet. "Prepare Mission" here creates a REAL
 * template mission (inbox_cleanup / daily_brief) that scans read-only and
 * gates every send behind approval — exactly the daily jobs.
 */
function connectedRoutineOpportunities(inp: RadarInputs): RadarItem[] {
  const has = (k: string) => inp.connections.some((c) => c.provider_key === k && c.status === "connected");
  const ranTemplate = (goalFragment: string) =>
    inp.missions.some((m) => m.goal.toLowerCase().includes(goalFragment) && ageDays(m.created_at, inp.now) <= 7);
  const items: RadarItem[] = [];

  if (has("gmail") && !ranTemplate("inbox")) {
    items.push({
      key: "opp_inbox_cleanup",
      category: "opportunity",
      title: "Put your inbox on a daily rail",
      observed: "Gmail is connected, and no inbox cleanup has run this week.",
      source: "Gmail (connection) + your mission history",
      why: "A daily inbox pass surfaces what needs you and drafts replies — every send still waits for approval.",
      inference: "A capability you've connected but haven't scheduled — not a claim your inbox is a mess.",
      recommendation: "Prepare an inbox-cleanup mission (drafts only; nothing sends without you).",
      confidence: "medium",
      involves: ["gmail"],
      suggestedTemplate: "inbox_cleanup",
      suggestedCommand: null,
      weight: 45,
    });
  }
  if (has("google-calendar") && !ranTemplate("brief")) {
    items.push({
      key: "opp_daily_brief",
      category: "opportunity",
      title: "Start your day with an operator brief",
      observed: "Google Calendar is connected, and no morning brief has run this week.",
      source: "Google Calendar (connection) + your mission history",
      why: "A morning brief pulls today's calendar and overnight signals into one prepared view.",
      inference: "A connected capability you haven't scheduled yet.",
      recommendation: "Prepare a daily-brief mission (read-only; time-blocking is a separate approval).",
      confidence: "medium",
      involves: ["google-calendar"],
      suggestedTemplate: "daily_brief",
      suggestedCommand: null,
      weight: 42,
    });
  }
  return items;
}

/**
 * Run every detector and return the findings, most urgent first. Pure and
 * deterministic — unit-testable without any store or network.
 */
export function detectRadar(inp: RadarInputs): RadarItem[] {
  const items = [
    ...pendingApprovals(inp),
    ...stalledMissions(inp),
    ...failedMissions(inp),
    ...brokenConnections(inp),
    ...routineOpportunities(inp),
    ...connectedRoutineOpportunities(inp),
    ...billingSignals(inp),
    ...onboardingOpportunity(inp),
  ];
  return items.sort((a, b) => b.weight - a.weight);
}
