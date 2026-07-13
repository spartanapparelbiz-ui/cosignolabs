import { getStore } from "../store";
import { getBrowserProvider } from "../browser";
import {
  isConsequential,
  type BrowserActionInput,
  type BrowserActionKind,
  type BrowserSessionHandle,
  type PageObservation,
} from "../browser/provider";
import type { BrowserSessionRecord, MissionRecord } from "../types";

/**
 * Browser-operator plumbing shared by the browser tools. It owns session
 * persistence (one row per mission browser session, never shared across
 * users), per-action logging, cost accounting against the mission budget,
 * and the read-only/consequential distinction. Consequential actions are
 * NEVER run here — they are only ever staged and handed to the approval
 * system; browserOps runs read-only actions and, separately, executes an
 * already-approved submit during verification.
 */

/** MVP limits (spec'd): 30-minute sessions, 20 page visits per mission. */
const SESSION_TTL_MS = 30 * 60_000;
export const MAX_PAGE_VISITS_PER_MISSION = 20;

/** Kinds that open/read a page (counted against the page-visit limit). */
const PAGE_VISIT_KINDS = new Set(["navigate", "inspect", "openLink", "scroll", "searchWithinPage"]);

export async function ensureBrowserSession(
  userId: string,
  mission: MissionRecord,
  operator: string,
  objective: string
): Promise<{ session: BrowserSessionRecord; handle: BrowserSessionHandle }> {
  const store = getStore();
  // Reuse the mission's live session across steps (research leaves it in
  // "extracting", verify submits on the same one). Only a terminal session
  // forces a new one — never spin up a second session mid-mission.
  const TERMINAL = new Set(["expired", "stopped", "failed_safely", "completed"]);
  const candidates = (await store.listBrowserSessions(userId, mission.id)).filter(
    (s) => s.provider_ref && !TERMINAL.has(s.status)
  );
  let existing: BrowserSessionRecord | undefined;
  for (const s of candidates) {
    // An expired session is marked honestly; completed research is already
    // persisted, so a fresh session simply continues where it left off.
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) {
      await store.updateBrowserSession(userId, s.id, {
        status: "expired",
        stop_reason: "the browser session expired. completed research was saved.",
      });
      continue;
    }
    existing = s;
    break;
  }
  const provider = getBrowserProvider();
  if (existing && existing.provider_ref) {
    return {
      session: existing,
      handle: { providerRef: existing.provider_ref, provider: existing.provider, simulated: existing.simulated },
    };
  }
  const handle = await provider.createSession({ objective });
  const session = await store.createBrowserSession({
    user_id: userId,
    mission_id: mission.id,
    operator,
    provider: provider.key,
    simulated: provider.simulated,
    objective,
    provider_ref: handle.providerRef,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  return { session, handle };
}

/** Budget guard: refuse a new browser action when the mission is over its caps. */
export async function budgetRemaining(mission: MissionRecord): Promise<{ ok: boolean; reason?: string }> {
  if (mission.browser_actions >= 30) {
    return { ok: false, reason: "this mission reached its browser-action limit — approve to raise it." };
  }
  return { ok: true };
}

let actionSeq = 0;

/**
 * Run ONE read-only browser action: log it, execute via the provider, persist
 * the observation summary, advance the session's current page, and count it
 * against the budget. Consequential kinds are rejected here by design.
 */
export async function runReadOnlyAction(
  userId: string,
  mission: MissionRecord,
  session: BrowserSessionRecord,
  handle: BrowserSessionHandle,
  purpose: string,
  action: BrowserActionInput
): Promise<{ ok: boolean; summary: string; observation?: PageObservation }> {
  const store = getStore();
  if (isConsequential(action.kind)) {
    return { ok: false, summary: "consequential browser actions can't run without approval." };
  }
  const budget = await budgetRemaining(mission);
  if (!budget.ok) return { ok: false, summary: budget.reason! };

  const existing = await store.listBrowserActions(userId, session.id);
  // Page-visit cap: a mission may open at most 20 pages. Reached → stop
  // safely with a plain reason (research already saved stays saved).
  if (PAGE_VISIT_KINDS.has(action.kind)) {
    const visits = existing.filter((a) => PAGE_VISIT_KINDS.has(a.kind)).length;
    if (visits >= MAX_PAGE_VISITS_PER_MISSION) {
      return {
        ok: false,
        summary: `this mission reached its ${MAX_PAGE_VISITS_PER_MISSION}-page limit — cosigno stopped browsing and kept everything it already found.`,
      };
    }
  }
  const idx = existing.length + actionSeq++;
  const row = await store.createBrowserAction({
    session_id: session.id,
    mission_id: mission.id,
    user_id: userId,
    idx,
    purpose,
    kind: action.kind,
    target: action.target ?? null,
    risk: "read",
    changes_external: false,
    requires_approval: false,
    state: "running",
    detail: {},
  });

  const outcome = await getBrowserProvider().act(handle, action);
  await store.updateBrowserAction(userId, row.id, {
    state: outcome.ok ? "completed" : "failed",
    detail: {
      summary: outcome.summary,
      url: outcome.observation?.url,
      title: outcome.observation?.title,
      simulated: outcome.simulated,
    },
  });
  if (outcome.observation) {
    await store.updateBrowserSession(userId, session.id, {
      current_url: outcome.observation.url,
      page_title: outcome.observation.title,
      last_action: `${action.kind}: ${outcome.summary}`,
      status: "active",
    });
  }
  await store.updateMission(userId, mission.id, {
    browser_actions: mission.browser_actions + 1,
  });
  mission.browser_actions += 1; // keep the in-memory copy honest for the caller

  return { ok: outcome.ok, summary: outcome.summary, observation: outcome.observation };
}

/**
 * Execute an ALREADY-APPROVED consequential submit (called only from a tool's
 * verify(), after the approval card executed). Logs it as a consequential
 * browser action, records the confirmation, and returns the evidence for
 * verification. Never called on the read path.
 */
export async function runApprovedSubmit(
  userId: string,
  mission: MissionRecord,
  session: BrowserSessionRecord,
  handle: BrowserSessionHandle,
  purpose: string,
  target: string
): Promise<{ ok: boolean; summary: string; confirmation?: Record<string, unknown>; simulated: boolean }> {
  const store = getStore();
  const existing = await store.listBrowserActions(userId, session.id);
  const row = await store.createBrowserAction({
    session_id: session.id,
    mission_id: mission.id,
    user_id: userId,
    idx: existing.length + actionSeq++,
    purpose,
    kind: "submitApprovedForm" as BrowserActionKind,
    target,
    risk: "consequential",
    changes_external: true,
    requires_approval: true,
    state: "submitted",
    detail: {},
  });
  await store.updateBrowserSession(userId, session.id, { status: "verifying" });
  const outcome = await getBrowserProvider().act(handle, { kind: "submitApprovedForm", target });
  await store.updateBrowserAction(userId, row.id, {
    state: outcome.ok ? "completed" : "failed",
    detail: { summary: outcome.summary, simulated: outcome.simulated },
    verification: outcome.confirmation ?? null,
  });
  return {
    ok: outcome.ok,
    summary: outcome.summary,
    confirmation: outcome.confirmation,
    simulated: outcome.simulated,
  };
}
