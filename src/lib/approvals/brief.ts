import type { ActionCategory, ActionRecord, Tier } from "../types";
import { payloadCount } from "../actionPresentation";

/**
 * The decision brief — everything a person needs to answer "should this
 * happen?" without opening anything else.
 *
 * An approval used to be a summary line, a payload blob and two buttons,
 * which asks someone to authorise an outward-facing action while withholding
 * the four things they'd actually want: why they're being asked at all, what
 * it touches, whether it can be taken back, and how sure cosigno is that the
 * proposal is complete. This module derives all of that.
 *
 * Every field here is DERIVED, DETERMINISTIC, AND PURE. Nothing comes from
 * model prose. That is deliberate and it is the same rule the authorization
 * engine follows: a brief that a model could word differently on a second
 * pass is a brief that can be talked into understating an effect. Given the
 * same action, this always produces the same brief, and it can always say
 * exactly where each line came from.
 *
 * The one field that needs care is confidence. It does NOT claim to predict
 * whether the action will succeed — nothing here can know that. It measures
 * how completely the proposal is specified against what its category
 * requires, and the UI states that in as many words. A number that looks
 * like a success probability and isn't would be the most dangerous thing on
 * the card.
 */

/* --------------------------------------------------------------- risk */

export type RiskLevel = "contained" | "external" | "permanent";

export interface Risk {
  level: RiskLevel;
  /** Two or three words: "stays inside", "leaves your workspace". */
  label: string;
  /** One sentence naming the actual consequence. */
  detail: string;
}

const CONTAINED: Risk = {
  level: "contained",
  label: "stays inside",
  detail: "nothing leaves your workspace and nothing is changed anywhere else.",
};

export function riskOf(category: ActionCategory, tier: Tier): Risk {
  switch (category) {
    case "search":
    case "summarize":
      return CONTAINED;
    case "draft":
      return {
        level: "contained",
        label: "stays inside",
        detail: "this is saved as a draft — nothing is sent and nobody else sees it.",
      };
    case "send_email":
      return {
        level: "external",
        label: "leaves your workspace",
        detail: "a real person receives this from your address, and a sent email can't be recalled.",
      };
    case "post_content":
      return {
        level: "external",
        label: "published",
        detail: "this becomes visible outside your workspace, where it may be seen before you can remove it.",
      };
    case "update_record":
      return {
        level: "external",
        label: "changes data",
        detail: "this overwrites data in a connected tool that other people and systems read.",
      };
    case "webhook":
      return {
        level: "external",
        label: "fires outward",
        detail: "this calls your configured endpoint, and whatever it triggers there can't be recalled.",
      };
    case "spend":
      return {
        level: "permanent",
        label: "moves money",
        detail: "this commits real money against your configured cap.",
      };
    case "payment":
      return {
        level: "permanent",
        label: "moves money",
        detail: "money leaves your account, and recovering it is a manual process.",
      };
    case "refund":
      return {
        level: "permanent",
        label: "moves money",
        detail: "money returns to a customer, and reversing a refund means asking for it back.",
      };
    case "delete":
      return {
        level: "permanent",
        label: "destroys data",
        detail: "the deleted items are gone — cosigno cannot bring them back.",
      };
    default:
      return tier === 1
        ? CONTAINED
        : {
            level: "external",
            label: "changes something",
            detail: "this changes something outside your workspace.",
          };
  }
}

/* ------------------------------------------------------------ rollback */

export interface Rollback {
  /** True only when cosigno itself could put this back. */
  possible: boolean;
  /** How, or why not. Always a full sentence. */
  detail: string;
}

/**
 * Whether this can be taken back — and honestly, which mostly means "no".
 *
 * The tempting version of this field offers a reassuring "undo available" on
 * everything, because that makes approving feel cheap. Approving should not
 * feel cheap on an action that can't be undone, so the pessimistic reading
 * wins every tie: an update whose previous values were never captured says
 * exactly that, rather than implying a restore that would silently fail.
 */
export function rollbackOf(action: Pick<ActionRecord, "category" | "payload">): Rollback {
  const p = action.payload ?? {};
  switch (action.category) {
    case "search":
    case "summarize":
      return { possible: true, detail: "there is nothing to undo — nothing changes." };
    case "draft":
      return { possible: true, detail: "delete the draft and nothing remains of it." };
    case "update_record": {
      const captured =
        (p.before && typeof p.before === "object") ||
        (p.changes && typeof p.changes === "object");
      return captured
        ? {
            possible: true,
            detail: "the previous values are recorded on the receipt, so this can be put back.",
          }
        : {
            possible: false,
            detail: "the previous values weren't captured, so putting this back would be manual.",
          };
    }
    case "send_email":
      return { possible: false, detail: "a sent email can't be recalled." };
    case "post_content":
      return {
        possible: false,
        detail: "you can delete the post afterwards, but not un-see it.",
      };
    case "webhook":
      return { possible: false, detail: "a delivered call can't be taken back." };
    case "delete":
      return { possible: false, detail: "deleted items can't be restored by cosigno." };
    case "refund":
    case "payment":
    case "spend":
      return {
        possible: false,
        detail: "money that has moved has to be recovered by hand.",
      };
    default:
      return { possible: false, detail: "assume this can't be undone." };
  }
}

/* ----------------------------------------------------------- duration */

/**
 * Roughly how long the execution itself takes, once approved.
 *
 * Deliberately a coarse band rather than a number. cosigno knows how many
 * API calls a category makes; it does not know how slow the other end will
 * be today, and "12s" printed beside a call that takes ninety is worse than
 * saying "a few seconds" and being right.
 */
export function durationOf(action: Pick<ActionRecord, "category" | "payload">): string {
  const n = payloadCount(action.payload ?? {}) ?? 1;
  switch (action.category) {
    case "search":
    case "summarize":
      return "a few seconds";
    case "draft":
    case "send_email":
      return n > 5 ? "under a minute" : "a few seconds";
    case "update_record":
    case "delete":
      return n > 20 ? "a minute or two" : "a few seconds";
    case "payment":
    case "refund":
    case "spend":
      return "up to a minute, depending on the provider";
    default:
      return "a few seconds";
  }
}

/* ---------------------------------------------------------- confidence */

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Confidence {
  level: ConfidenceLevel;
  /** 0..1 — the share of the category's required details that are present. */
  score: number;
  /** What's missing or wrong. Empty when the proposal is fully specified. */
  gaps: string[];
}

/**
 * The details each category needs before a proposal counts as fully
 * specified. Each entry is a list of alternatives — any one satisfies it —
 * because a payload may legitimately name a recipient as `to` or `recipient`.
 */
const REQUIRED: Partial<Record<ActionCategory, Array<{ keys: string[]; name: string }>>> = {
  send_email: [
    { keys: ["to", "recipient"], name: "a recipient" },
    { keys: ["subject"], name: "a subject" },
    { keys: ["body", "content", "text"], name: "the message body" },
  ],
  draft: [
    { keys: ["to", "recipient", "thread_id"], name: "who it's for" },
    { keys: ["body", "content", "text"], name: "the message body" },
  ],
  post_content: [
    { keys: ["destination", "channel", "integration"], name: "where it posts" },
    { keys: ["body", "content", "text"], name: "the content" },
  ],
  update_record: [
    { keys: ["target", "record_id", "id"], name: "which record" },
    { keys: ["changes", "after", "fields"], name: "what changes" },
  ],
  delete: [{ keys: ["target", "record_id", "id", "query"], name: "what gets deleted" }],
  payment: [
    { keys: ["amount"], name: "an amount" },
    { keys: ["to", "recipient", "destination"], name: "who receives it" },
  ],
  refund: [
    { keys: ["amount"], name: "an amount" },
    { keys: ["to", "recipient", "order", "charge_id"], name: "which payment" },
  ],
  spend: [{ keys: ["amount"], name: "an amount" }],
  webhook: [{ keys: ["url", "destination", "endpoint"], name: "an endpoint" }],
  connection_call: [{ keys: ["operation", "tool", "action"], name: "which operation" }],
};

function present(payload: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((k) => {
    const v = payload[k];
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v as object).length > 0;
    return true;
  });
}

/**
 * How completely this proposal is specified.
 *
 * NOT a prediction. cosigno cannot know whether an email will bounce or an
 * API will be down, and a number implying it could would be believed. What
 * it can check is whether the proposal in front of you contains everything
 * its own category requires, and whether anything upstream flagged it — which
 * is exactly what a person scanning the card is checking by eye anyway.
 *
 * Flagged content is a hard floor at low, whatever the payload looks like: a
 * perfectly-specified action assembled from content that tried to steer the
 * agent is the most dangerous thing this function can be handed.
 */
export function confidenceOf(
  action: Pick<ActionRecord, "category" | "payload" | "injection_flag" | "tier_note">
): Confidence {
  const payload = action.payload ?? {};
  const required = REQUIRED[action.category] ?? [];

  const missing = required.filter((r) => !present(payload, r.keys)).map((r) => r.name);
  const score = required.length === 0 ? 1 : (required.length - missing.length) / required.length;

  const gaps = missing.map((m) => `${m} is missing`);
  if (action.injection_flag) {
    gaps.unshift("outside content tried to direct this action");
  }
  if (action.tier_note) {
    gaps.push("cosigno asked for a lower authority than the rules allow");
  }

  let level: ConfidenceLevel =
    score >= 1 ? "high" : score >= 0.5 ? "medium" : "low";
  if (action.tier_note && level === "high") level = "medium";
  if (action.injection_flag) level = "low";

  return { level, score, gaps };
}

/* --------------------------------------------------------- affected apps */

export interface AffectedApp {
  /** What to show. Already human-readable. */
  name: string;
  /** A known connector key when the payload names one, for the logo. */
  providerKey: string | null;
}

/** Payload values that plausibly name an app or destination. */
const APP_KEYS = ["integration", "provider", "app", "source", "destination", "channel", "service"];

/** Strings a payload uses for an app, mapped to the connector they mean. */
const KNOWN: Array<{ match: RegExp; key: string; name: string }> = [
  { match: /gmail|google.?mail/i, key: "google", name: "Gmail" },
  { match: /google.?calendar|gcal/i, key: "google-calendar", name: "Google Calendar" },
  { match: /google.?drive|gdrive/i, key: "google-drive", name: "Google Drive" },
  { match: /outlook|microsoft/i, key: "outlook", name: "Outlook" },
  { match: /github/i, key: "github", name: "GitHub" },
  { match: /slack/i, key: "slack", name: "Slack" },
  { match: /notion/i, key: "notion", name: "Notion" },
  { match: /stripe/i, key: "stripe", name: "Stripe" },
];

/**
 * The apps this action touches.
 *
 * Only what the payload actually names, plus the category's own surface when
 * that surface is unambiguous (an email category touches email whatever the
 * payload says). It never guesses at a connector: listing "Slack" beside an
 * action that has nothing to do with Slack would make the whole brief
 * untrustworthy, and this row is read as a fact.
 */
export function affectedApps(
  action: Pick<ActionRecord, "category" | "payload">
): AffectedApp[] {
  const payload = action.payload ?? {};
  const found = new Map<string, AffectedApp>();

  for (const key of APP_KEYS) {
    const v = payload[key];
    if (typeof v !== "string" || !v.trim()) continue;
    const known = KNOWN.find((k) => k.match.test(v));
    if (known) found.set(known.key, { name: known.name, providerKey: known.key });
    else if (v.length <= 24) found.set(v, { name: v, providerKey: null });
  }

  if (found.size === 0) {
    // No named app. Say what the category unambiguously touches instead of
    // inventing a connector — "your email" is true and useful; "Gmail" would
    // be a guess.
    const fallback: Partial<Record<ActionCategory, string>> = {
      send_email: "your email",
      draft: "your email",
      post_content: "a connected app",
      update_record: "a connected tool",
      delete: "a connected tool",
      webhook: "your configured endpoint",
      payment: "your payment provider",
      refund: "your payment provider",
      spend: "your payment provider",
      connection_call: "a connected app",
    };
    const name = fallback[action.category];
    if (name) found.set(name, { name, providerKey: null });
  }

  return [...found.values()].slice(0, 4);
}

/* -------------------------------------------------------------- reason */

/**
 * Why this is in front of you at all.
 *
 * Not "why cosigno wants to do it" — the summary already says that. This is
 * the rule that stopped it, which is the question someone actually has when a
 * card appears: what about this made it need me?
 */
export function reasonOf(
  action: Pick<ActionRecord, "category" | "tier" | "injection_flag">
): string {
  if (action.injection_flag) {
    return "content from outside tried to direct this action, so it's locked until you re-issue it yourself.";
  }
  if (action.tier === 3) {
    return "this category is locked: it always needs your signature, and no setting can lower that.";
  }
  const risk = riskOf(action.category, action.tier);
  if (risk.level === "permanent") {
    return "it moves money or destroys data, so cosigno never does it on its own.";
  }
  if (risk.level === "external") {
    return "it reaches outside your workspace, and everything that leaves needs your approval first.";
  }
  return "your rules ask for approval on this category.";
}

/* --------------------------------------------------------------- brief */

export interface ApprovalBrief {
  /** What this does, in one line. */
  purpose: string;
  /** Why it needs you. */
  reason: string;
  risk: Risk;
  confidence: Confidence;
  apps: AffectedApp[];
  rollback: Rollback;
  /** Coarse band — "a few seconds". Never a fake countdown. */
  duration: string;
}

export function approvalBrief(action: ActionRecord): ApprovalBrief {
  return {
    purpose: action.summary,
    reason: reasonOf(action),
    risk: riskOf(action.category, action.tier),
    confidence: confidenceOf(action),
    apps: affectedApps(action),
    rollback: rollbackOf(action),
    duration: durationOf(action),
  };
}
