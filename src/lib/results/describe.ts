import type { ActionRecord, ActionEventRecord, ActionCategory } from "../types";

/**
 * Turn a recorded action into the six answers a result has to give:
 * what happened, what changed, where, who, is it finished, what now.
 *
 * This is pure and separate from the card that renders it, because the honesty
 * rules live here and they are the part worth testing. Three of them do real
 * work:
 *
 *  · BEFORE/AFTER ONLY WHEN BOTH ARE KNOWN. A comparison is the fastest way to
 *    explain a change and the fastest way to invent one. Opening an issue has
 *    no "before" — the issue did not exist — so it reports as a creation. A
 *    card that rendered "Before: none → After: created" would be dressing up a
 *    fact as a measurement.
 *  · NO UNDO CLAIM. Cosigno cannot reverse a provider call. The card answers
 *    "can I undo it?" with what actually reverses it, in the provider's own
 *    terms, rather than offering a button that would have to lie.
 *  · LOCATION FROM THE PAYLOAD ONLY. Where an action landed is read from what
 *    was actually sent. Nothing is inferred from the summary text, which is
 *    prose and can be wrong.
 */

export type ResultStatus =
  | "completed"
  | "running"
  | "needs_approval"
  | "failed"
  | "declined"
  | "queued";

export type ChangeKind = "created" | "updated" | "deleted" | "sent" | "refunded" | "blocked";

export interface ResultChange {
  kind: ChangeKind;
  /** What the thing is, in the user's words. "Issue #7". */
  label: string;
  /** A link to the real object, when the provider returned one. */
  href?: string;
  /** Both present or both absent — never one. */
  before?: string;
  after?: string;
}

export interface ResultView {
  /** One plain sentence. No jargon, no ids the reader didn't supply. */
  headline: string;
  status: ResultStatus;
  /** "GitHub" — omitted rather than guessed. */
  app?: string;
  /** "Repository" */
  objectType?: string;
  /** "spartanapparelbiz-ui/cosignolabs" */
  objectName?: string;
  changes: ResultChange[];
  requestedBy: string;
  approvedBy?: string;
  finishedAt?: string;
  /** How to reverse it, in the provider's terms. Null when nothing to reverse. */
  howToUndo: string | null;
  /** Nothing was actually done — used to keep failed cards from reading as done. */
  nothingHappened: boolean;
}

const STATUS_OF: Record<ActionRecord["status"], ResultStatus> = {
  proposed: "needs_approval",
  approved: "running",
  executing: "running",
  executed: "completed",
  vetoed: "declined",
  failed: "failed",
};

/** Provider key → the name a person would say. */
const APP_NAME: Record<string, string> = {
  github: "GitHub",
  google: "Gmail",
  "google-calendar": "Google Calendar",
  "google-drive": "Google Drive",
  outlook: "Outlook",
  slack: "Slack",
  notion: "Notion",
};

/** What a category does to the world, for the icon and the verb. */
const KIND_OF: Partial<Record<ActionCategory, ChangeKind>> = {
  send_email: "sent",
  post_content: "created",
  update_record: "updated",
  delete: "deleted",
  refund: "refunded",
  payment: "sent",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Where this landed, read from the payload that was actually sent. Returns
 * undefined rather than guessing — an unlabeled result is better than a
 * confidently wrong location.
 */
function locate(action: ActionRecord): Pick<ResultView, "app" | "objectType" | "objectName"> {
  const p = action.payload ?? {};
  const args = (p.args && typeof p.args === "object" ? p.args : {}) as Record<string, unknown>;

  const repo = str(args.repo) ?? str(p.repo);
  if (repo) return { app: "GitHub", objectType: "Repository", objectName: repo };

  const to = str(args.to) ?? str(p.to) ?? str(p.recipient);
  if (to) return { app: APP_NAME[str(p.provider) ?? ""] ?? undefined, objectType: "Recipient", objectName: to };

  const provider = str(p.provider);
  if (provider && APP_NAME[provider]) return { app: APP_NAME[provider] };
  return {};
}

/**
 * What actually changed. Built from the execution RESULT, not the proposal:
 * a proposal describes an intention, and reporting an intention as an outcome
 * is how a result card starts lying.
 */
/**
 * `connection_call` is a generic envelope — the same category carries a
 * creation, an edit, and a deletion — so its verb has to come from the action
 * that actually ran. Reading it off the category alone labels a brand-new
 * issue as "Updated", which is a small word and a real misreport.
 *
 * Matched on stems so create/created/creating all land, and checked
 * destructive-first: "delete_draft_message" contains both "draft" and
 * "delete", and calling a deletion something softer is the expensive mistake.
 */
function kindFromActionId(actionId: string): ChangeKind | undefined {
  const id = actionId.toLowerCase();
  if (/\b(delete|remove|destroy|trash|archive)/.test(id)) return "deleted";
  if (/\b(refund)/.test(id)) return "refunded";
  if (/\b(send|post|email|message)/.test(id)) return "sent";
  if (/\b(create|open|add|new|draft)/.test(id)) return "created";
  if (/\b(update|edit|patch|set|modify|label|mark)/.test(id)) return "updated";
  return undefined;
}

function changesFrom(action: ActionRecord): ResultChange[] {
  if (action.status !== "executed") return [];
  const result = action.result ?? {};

  const calledAction = str((action.payload ?? {}).action);
  const kind =
    (calledAction ? kindFromActionId(calledAction) : undefined) ??
    KIND_OF[action.category] ??
    "updated";

  const href = str(result.url) ?? str(result.html_url);
  // GitHub's own summary carries the issue number; prefer the provider's words
  // for the label since it is the system of record for what it just made.
  const label = str(result.summary) ?? action.summary;

  const before = str(result.before);
  const after = str(result.after);

  return [
    {
      kind,
      label,
      ...(href ? { href } : {}),
      // Both, or neither. A half-comparison invites the reader to supply the
      // missing side themselves.
      ...(before !== undefined && after !== undefined ? { before, after } : {}),
    },
  ];
}

/**
 * How to reverse this, in the provider's terms. Cosigno has no undo — it
 * cannot un-send mail or un-open an issue — so this describes the real remedy
 * instead of implying a capability that does not exist.
 */
function undoAdvice(action: ActionRecord): string | null {
  if (action.status !== "executed") return null;
  switch (action.category) {
    case "post_content":
    case "connection_call":
      return "cosigno can't undo this. Close or delete it in the app if you need it gone.";
    case "send_email":
      return "email can't be unsent. Reply or follow up if it needs correcting.";
    case "delete":
      return "cosigno can't restore this. Check the app's own trash or backups.";
    case "refund":
    case "payment":
      return "money movement can't be reversed here — handle it in the payment provider.";
    default:
      return "cosigno can't undo this automatically.";
  }
}

/** One plain sentence. Uses the provider's own words when it has them. */
function headlineFor(action: ActionRecord, status: ResultStatus): string {
  const summary = str(action.result?.summary);
  switch (status) {
    case "completed":
      // "opened issue #7 in owner/repo." — already plain, already true.
      return summary ? `cosigno ${summary}` : `cosigno completed: ${action.summary}`;
    case "needs_approval":
      return `cosigno is waiting for you to approve: ${action.summary}`;
    case "running":
      return `cosigno is working on: ${action.summary}`;
    case "declined":
      return `you declined: ${action.summary}. nothing was done.`;
    case "failed":
      return `this didn't go through: ${action.summary}. nothing was changed.`;
    default:
      return action.summary;
  }
}

export function describeResult(
  action: ActionRecord,
  events: ActionEventRecord[] = []
): ResultView {
  const status = STATUS_OF[action.status];
  const forThis = events.filter((e) => e.action_id === action.id);

  const approvedEvent = forThis.filter((e) => e.type === "approved").pop();
  const approvedByUser = approvedEvent?.actor === "user";
  const autoApproved = Boolean(approvedEvent?.detail?.auto);

  return {
    headline: headlineFor(action, status),
    status,
    ...locate(action),
    changes: changesFrom(action),
    requestedBy: "cosigno",
    // Only claim a human signed if a human actually did.
    approvedBy: approvedEvent ? (autoApproved ? undefined : approvedByUser ? "you" : undefined) : undefined,
    finishedAt: action.resolved_at ?? undefined,
    howToUndo: undoAdvice(action),
    // A failed or declined card must never read as done.
    nothingHappened: status === "failed" || status === "declined",
  };
}
