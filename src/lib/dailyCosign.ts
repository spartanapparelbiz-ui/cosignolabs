import { getStore } from "./store";
import { buildRadar, type RadarItemView } from "./radar";
import { buildCosignCard, type CosignCard } from "./cosignCard";
import type { MissionRecord } from "./types";

/**
 * Daily CoSign — a single, honest review of what's waiting on the user today:
 * prepared replies/actions, scheduling problems, follow-ups, deadlines,
 * warnings, and recommended missions.
 *
 * Deliberately does NOT include an "approve everything" shortcut. Each item
 * links to its own approval — the user approves individual actions, one
 * deliberate decision at a time. This module only READS and organizes; it
 * never proposes or executes.
 */

export interface DailySection<T> {
  title: string;
  blurb: string;
  items: T[];
}

export interface DailyCosign {
  as_of: string;
  greeting: string;
  /** Prepared CoSign Cards awaiting the user's approval/signature. */
  prepared: DailySection<CosignCard>;
  /** Missions that need an answer or are stuck (scheduling/follow-up problems). */
  attention: DailySection<{ mission_id: string; goal: string; state: string; note: string }>;
  /** Warnings surfaced by Radar (at-risk items). */
  warnings: DailySection<Pick<RadarItemView, "key" | "title" | "observed" | "why" | "recommendation">>;
  /** Recommended missions to prepare (opportunities/routines from Radar). */
  recommended: DailySection<
    Pick<RadarItemView, "key" | "title" | "recommendation" | "suggestedTemplate" | "suggestedCommand">
  >;
  /** Total count of things that need a decision. */
  needs_decision: number;
}

function greeting(now: Date): string {
  const h = now.getUTCHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  return `Good ${part}. Here's what's prepared and what needs you.`;
}

export async function buildDailyCosign(userId: string, now = Date.now()): Promise<DailyCosign> {
  const store = getStore();
  const [proposed, missions, radar] = await Promise.all([
    store.listActions(userId, { status: "proposed", limit: 50 }),
    store.listMissions(userId, 100),
    buildRadar(userId, now),
  ]);

  // Prepared cards (not injection-flagged — flagged cards can't be approved).
  const prepared = proposed
    .filter((a) => !a.injection_flag)
    .map((a) => buildCosignCard(a));

  // Missions needing the user, or stalled — the "scheduling problems /
  // follow-ups" bucket, drawn from real mission state.
  const attentionMissions = missions.filter(
    (m: MissionRecord) => m.state === "awaiting_input" || m.state === "awaiting_approval"
  );
  const attention = attentionMissions.map((m) => ({
    mission_id: m.id,
    goal: m.goal,
    state: m.state,
    note:
      m.state === "awaiting_input" && m.pending_question
        ? m.pending_question.question
        : "A prepared step is waiting for your approval.",
  }));

  const warnings = radar.items
    .filter((i) => i.category === "at_risk" && i.status !== "dismissed" && i.status !== "snoozed")
    .map((i) => ({
      key: i.key,
      title: i.title,
      observed: i.observed,
      why: i.why,
      recommendation: i.recommendation,
    }));

  const recommended = radar.items
    .filter(
      (i) =>
        (i.category === "opportunity" || i.category === "routine") &&
        i.status !== "dismissed" &&
        i.status !== "snoozed"
    )
    .map((i) => ({
      key: i.key,
      title: i.title,
      recommendation: i.recommendation,
      suggestedTemplate: i.suggestedTemplate,
      suggestedCommand: i.suggestedCommand,
    }));

  return {
    as_of: new Date(now).toISOString(),
    greeting: greeting(new Date(now)),
    prepared: {
      title: "Prepared for you",
      blurb: "Approve, edit, or reject each — nothing runs until you do.",
      items: prepared,
    },
    attention: {
      title: "Needs an answer",
      blurb: "Missions paused on a decision or a question.",
      items: attention,
    },
    warnings: {
      title: "Warnings",
      blurb: "Things that could go wrong if left alone.",
      items: warnings,
    },
    recommended: {
      title: "Recommended missions",
      blurb: "Prepare these when you're ready — still approval-gated.",
      items: recommended,
    },
    needs_decision: prepared.length + attention.length,
  };
}
