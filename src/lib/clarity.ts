import type { ActionCategory, ActionRecord } from "./types";
import { operatorOf } from "./actionPresentation";

/**
 * The clarity system — plain-language guidance derived ONLY from real state
 * (the mission's actions and their statuses). Pure functions, no React, never
 * throw. Nothing here invents progress: every label maps to something that
 * actually happened or is actually waiting. This is presentation only — it
 * has no say in the approval state machine.
 */

type A = Pick<
  ActionRecord,
  "id" | "category" | "tier" | "status" | "summary" | "payload" | "result" | "injection_flag" | "created_at"
>;

/* ------------------------------------------------------- mission state */

export interface MissionState {
  key:
    | "idle"
    | "planning"
    | "waiting_approval"
    | "executing"
    | "held"
    | "completed"
    | "partial"
    | "failed"
    | "stopped";
  /** Short label shown next to the mission title. */
  label: string;
  /** One plain sentence explaining what the state means. */
  detail: string;
}

/**
 * One visible state per mission, decided by what the actions are actually
 * doing. Never a spinner without a meaning.
 */
export function missionState(actions: readonly A[], planning: boolean): MissionState {
  if (planning) {
    return {
      key: "planning",
      label: "creating the plan",
      detail: "cosigno is turning your request into concrete steps. nothing has run yet.",
    };
  }
  if (actions.length === 0) {
    return {
      key: "idle",
      label: "ready for a task",
      detail: "describe the result you want — cosigno will turn it into a plan.",
    };
  }
  const proposed = actions.filter((a) => a.status === "proposed");
  const inFlight = actions.some((a) => a.status === "approved" || a.status === "executing");
  const executed = actions.filter((a) => a.status === "executed").length;
  const failed = actions.filter((a) => a.status === "failed").length;
  const vetoed = actions.filter((a) => a.status === "vetoed").length;

  if (inFlight) {
    return {
      key: "executing",
      label: "executing approved action",
      detail: "cosigno is carrying out a step you approved.",
    };
  }
  if (proposed.length > 0) {
    if (proposed.every((a) => a.injection_flag)) {
      return {
        key: "held",
        label: "held for safety",
        detail: "outside content tried to steer this work, so it's locked until you re-issue the command yourself.",
      };
    }
    return {
      key: "waiting_approval",
      label: "waiting for your approval",
      detail: `${proposed.length} step${proposed.length === 1 ? "" : "s"} need${proposed.length === 1 ? "s" : ""} your decision before anything happens.`,
    };
  }
  // Everything resolved.
  if (executed > 0 && failed === 0) {
    return {
      key: "completed",
      label: "completed",
      detail: vetoed > 0 ? "finished — the steps you vetoed were never run." : "every step finished and was recorded.",
    };
  }
  if (executed > 0 && failed > 0) {
    return {
      key: "partial",
      label: "partially completed",
      detail: `${executed} step${executed === 1 ? "" : "s"} finished; ${failed} did not complete. nothing was left half-done.`,
    };
  }
  if (failed > 0) {
    return {
      key: "failed",
      label: "failed safely",
      detail: "the steps didn't complete and no external changes were made.",
    };
  }
  return {
    key: "stopped",
    label: "stopped",
    detail: "you vetoed the remaining steps — nothing else will run.",
  };
}

/* ----------------------------------------------- plain-language sources */

export interface SourceIdentity {
  /** Plain name the user recognizes ("Gmail", "your workspace sandbox"). */
  name: string;
  /** What cosigno is doing with it, in one sentence. */
  doing: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  google: "Gmail",
  "google-calendar": "Google Calendar",
  "google-drive": "Google Drive",
  github: "GitHub",
  outlook: "Outlook",
  slack: "Slack",
  notion: "Notion",
};

function payloadStr(p: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = p?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * What the step actually touches, in words the user recognizes. Connector
 * calls name the real app; sandbox categories are honest about being a
 * simulation inside the workspace.
 */
export function sourceIdentity(action: Pick<A, "category" | "payload">): SourceIdentity {
  if (action.category === "connection_call") {
    const key =
      payloadStr(action.payload, "provider") ??
      payloadStr(action.payload, "provider_key") ??
      "";
    const display = payloadStr(action.payload, "connection_name");
    const name = display ?? PROVIDER_NAMES[key] ?? "a connected app";
    return { name, doing: `cosigno uses your connected ${name} account for this step.` };
  }
  switch (operatorOf(action.category)) {
    case "research":
      return { name: "workspace sandbox", doing: "reads and summarizes — nothing outside changes." };
    case "communication":
      return { name: "workspace sandbox", doing: "prepares the message here first; sending waits for you." };
    case "records":
      return { name: "workspace sandbox", doing: "prepares the data change here before anything is written." };
    case "finance":
      return { name: "workspace sandbox", doing: "prepares the payment details; no money moves without you." };
    case "cleanup":
      return { name: "workspace sandbox", doing: "stages the deletion; nothing is removed without typed approval." };
    default:
      return { name: "workspace sandbox", doing: "works inside your workspace." };
  }
}

/* ------------------------------------------------- approval language */

/** Action-specific approval labels — never a bare "approve"/"confirm". */
export function approveLabel(category: ActionCategory): string {
  switch (category) {
    case "send_email":
      return "approve & send";
    case "draft":
      return "save the draft";
    case "post_content":
      return "approve & publish";
    case "update_record":
      return "approve & update";
    case "spend":
    case "payment":
      return "approve & pay";
    case "refund":
      return "approve & refund";
    case "delete":
      return "approve deletion";
    case "webhook":
      return "approve & fire";
    case "connection_call":
      return "approve & run";
    default:
      return "approve & run";
  }
}

/** What has ALREADY happened (truth before approval). */
/* --------------------------------------------------------------- why me? */

const WHY_TIER3: Partial<Record<ActionCategory, string>> = {
  delete: "this permanently removes something and can't be undone",
  refund: "this returns money to a customer",
  payment: "this moves money out of your accounts",
};

const WHY_SIGN2: Partial<Record<ActionCategory, string>> = {
  send_email: "this sends information outside your workspace",
  post_content: "this publishes something publicly",
  spend: "this commits money under your spending rules",
  webhook: "this fires an outbound call to an external system",
};

/**
 * WHY ME? — every handoff can answer "why do you need me?" in one honest
 * sentence, derived from the action's real category, tier, and flags. Makes
 * the boundary understandable instead of arbitrary.
 */
export function whyMe(
  action: Pick<ActionRecord, "category" | "tier" | "injection_flag">
): string {
  if (action.injection_flag) {
    return "External content tried to direct this action — it's held so only a fresh command from you can do it.";
  }
  if (action.tier === 3) {
    return `I'm asking because ${WHY_TIER3[action.category] ?? "this is a locked action"} — locked actions always need your deliberate signature.`;
  }
  if (WHY_SIGN2[action.category]) {
    return `I'm asking because ${WHY_SIGN2[action.category]} — external actions always wait for your signature.`;
  }
  return "I'm asking because this changes data in a connected tool, and your permissions require your one-click approval first.";
}

export function beforeApprovalLine(category: ActionCategory): string {
  switch (category) {
    case "send_email":
    case "draft":
      return "nothing has been sent — this is only prepared.";
    case "post_content":
      return "nothing has been published — this is only prepared.";
    case "spend":
    case "payment":
    case "refund":
      return "no money has moved — this is only prepared.";
    case "delete":
      return "nothing has been deleted — this is only staged.";
    case "update_record":
      return "no data has changed — this is only prepared.";
    default:
      return "no external action has been taken yet.";
  }
}

/** What happens the moment the user approves. */
export function afterApprovalLine(category: ActionCategory): string {
  switch (category) {
    case "send_email":
      return "after approval, cosigno sends it and records the result on this card.";
    case "post_content":
      return "after approval, cosigno publishes it and records the result on this card.";
    case "spend":
    case "payment":
      return "after approval, the payment is made and the receipt lands on this card.";
    case "refund":
      return "after approval, the refund is issued and the receipt lands on this card.";
    case "delete":
      return "after typed approval, the deletion runs — it can't be automatically undone.";
    case "update_record":
      return "after approval, the change is written and the result lands on this card.";
    default:
      return "after approval, cosigno runs this step and records the result on this card.";
  }
}

/* --------------------------------------------------------- live guide */

export interface MissionGuideView {
  /** The step running or waiting right now, if any. */
  current: { summary: string; source: SourceIdentity; approval: string } | null;
  /** The step after it, if any. */
  next: string | null;
  /** External changes actually made (executed action summaries + results). */
  changes: string[];
  /** Honest line when `changes` is empty. */
  noChangesLine: string;
}

function approvalLineFor(a: A): string {
  if (a.injection_flag) return "held — outside content tried to steer this step.";
  if (a.status === "approved" || a.status === "executing") return "approved — running now.";
  if (a.tier === 1) return "no approval needed — read-only or reversible.";
  if (a.tier === 3) return "waiting for your typed approval — destructive step.";
  return "waiting for your approval.";
}

/** The persistent "what is cosigno doing?" view, from real actions only. */
export function missionGuide(actions: readonly A[]): MissionGuideView {
  const inFlight = actions.find((a) => a.status === "approved" || a.status === "executing");
  const proposed = actions.filter((a) => a.status === "proposed");
  const current = inFlight ?? proposed[0] ?? null;
  const next = inFlight ? proposed[0] ?? null : proposed[1] ?? null;

  const changes = actions
    .filter((a) => a.status === "executed")
    .map((a) => {
      const summary = a.result && typeof a.result.summary === "string" ? a.result.summary : null;
      const simulated = a.result?.simulated === true;
      return `${a.summary}${summary ? ` — ${summary}` : ""}${simulated ? " (sandbox — nothing external changed)" : ""}`;
    });

  return {
    current: current
      ? {
          summary: current.summary,
          source: sourceIdentity(current),
          approval: approvalLineFor(current),
        }
      : null,
    next: next ? next.summary : null,
    changes,
    noChangesLine: "no external changes have been made.",
  };
}

/* ------------------------------------------------------ progress steps */

export interface MissionStep {
  id: string;
  title: string;
  operator: string;
  /** done | running | waiting | held | vetoed | failed */
  state: "done" | "running" | "waiting" | "held" | "vetoed" | "failed";
  /** One line: what this step's approval situation is / was. */
  note: string;
}

/** The visible plan: every proposed action is a step with an honest state. */
export function missionSteps(actions: readonly A[]): MissionStep[] {
  return actions.map((a) => ({
    id: a.id,
    title: a.summary,
    operator: operatorOf(a.category),
    state:
      a.status === "executed"
        ? "done"
        : a.status === "approved" || a.status === "executing"
          ? "running"
          : a.status === "failed"
            ? "failed"
            : a.status === "vetoed"
              ? "vetoed"
              : a.injection_flag
                ? "held"
                : "waiting",
    note:
      a.status === "executed"
        ? "finished and recorded."
        : a.status === "failed"
          ? "didn't complete — nothing was left half-done."
          : a.status === "vetoed"
            ? "you vetoed this — it never ran."
            : approvalLineFor(a),
  }));
}
