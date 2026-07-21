import { getStore } from "../store";
import type { MissionRecord, MissionStepRecord } from "../types";

/**
 * The three daily launch jobs — fixed, inspectable plans over the inbox and
 * calendar tools. Read-only scanning and drafting run automatically; every
 * send, archive, or calendar change is its own approval card, and the receipt
 * closes each mission with what actually ran.
 */

export const INBOX_CLEANUP_GOAL =
  "clean up my inbox — summarize what matters, draft replies, archive the clutter";
export const FOLLOWUPS_GOAL = "prepare follow-ups for the threads waiting on a response";
export const DAILY_BRIEF_GOAL = "build my morning operator brief";

async function createJob(
  userId: string,
  goal: string,
  steps: { purpose: string; operator: string; tool: string; depends_on: number[] }[]
): Promise<{ mission: MissionRecord; steps: MissionStepRecord[] }> {
  const store = getStore();
  const session = await store.createSession(userId, goal);
  const mission = await store.createMission({ user_id: userId, session_id: session.id, goal });
  const created = await store.createMissionSteps(
    steps.map((s, idx) => ({ mission_id: mission.id, user_id: userId, idx, ...s }))
  );
  return { mission, steps: created };
}

export function createInboxCleanupMission(userId: string) {
  return createJob(userId, INBOX_CLEANUP_GOAL, [
    { purpose: "scan the inbox for newsletter clutter and threads that need you", operator: "communication", tool: "inbox.scan", depends_on: [] },
    { purpose: "summarize what actually matters", operator: "research", tool: "inbox.summarize", depends_on: [0] },
    { purpose: "draft replies for the waiting threads (drafts never send)", operator: "communication", tool: "inbox.draft_replies", depends_on: [1] },
    { purpose: "offer the newsletter cleanup for your approval — nothing is archived without it", operator: "communication", tool: "inbox.propose_cleanup", depends_on: [1] },
    // special: the engine runs the receipt only after everything else settles
    { purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", depends_on: [] },
  ]);
}

export function createFollowupsMission(userId: string) {
  return createJob(userId, FOLLOWUPS_GOAL, [
    { purpose: "find the threads waiting on a response", operator: "communication", tool: "followup.find", depends_on: [] },
    { purpose: "draft context-aware follow-ups and propose a send time (drafts never send)", operator: "communication", tool: "followup.draft", depends_on: [0] },
    { purpose: "offer the first follow-up for your approval — nothing sends without it", operator: "communication", tool: "followup.offer_send", depends_on: [1] },
    { purpose: "offer a calendar reminder for the rest — a separate approval card", operator: "calendar", tool: "calendar.propose_reminder", depends_on: [1] },
    { purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", depends_on: [] },
  ]);
}

export function createDailyBriefMission(userId: string) {
  return createJob(userId, DAILY_BRIEF_GOAL, [
    { purpose: "read today's calendar", operator: "calendar", tool: "brief.calendar", depends_on: [] },
    { purpose: "read the overnight inbox signals", operator: "communication", tool: "brief.signals", depends_on: [] },
    { purpose: "write the morning operator brief", operator: "files", tool: "deliverable.daily_brief", depends_on: [0, 1] },
    { purpose: "offer to block time for the top item — a separate approval card", operator: "calendar", tool: "calendar.propose_reminder", depends_on: [2] },
    { purpose: "write the mission receipt", operator: "chief", tool: "mission.receipt", depends_on: [] },
  ]);
}
