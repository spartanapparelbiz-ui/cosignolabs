export type Tier = 1 | 2 | 3;

export type ActionStatus =
  | "proposed"
  | "approved"
  | "vetoed"
  | "executing"
  | "executed"
  | "failed";

export type ActionCategory =
  | "search"
  | "summarize"
  | "draft"
  | "send_email"
  | "post_content"
  | "update_record"
  | "spend"
  | "webhook"
  | "delete"
  | "refund"
  | "payment"
  | "connection_call";

export interface CategoryMeta {
  category: ActionCategory;
  label: string;
  description: string;
  defaultTier: Tier;
  /** Tier-3 categories are pinned: users and the agent can never lower them. */
  pinned: boolean;
  /**
   * Whether the PLANNER may propose this category. Integration/MCP execution
   * (connection_call) is created by the integrations runtime after explicit
   * user action — never selected by the model — so it's excluded from the
   * planner's tool enum.
   */
  plannerSelectable?: boolean;
}

export const CATEGORIES: Record<ActionCategory, CategoryMeta> = {
  search: {
    category: "search",
    label: "Search",
    description: "Read-only lookups across connected tools",
    defaultTier: 1,
    pinned: false,
  },
  summarize: {
    category: "summarize",
    label: "Summarize",
    description: "Read and condense content — nothing leaves your workspace",
    defaultTier: 1,
    pinned: false,
  },
  draft: {
    category: "draft",
    label: "Draft",
    description: "Write drafts that are saved, never sent",
    defaultTier: 1,
    pinned: false,
  },
  send_email: {
    category: "send_email",
    label: "Send email",
    description: "Send mail on your behalf",
    defaultTier: 2,
    pinned: false,
  },
  post_content: {
    category: "post_content",
    label: "Post content",
    description: "Publish or post to external surfaces",
    defaultTier: 2,
    pinned: false,
  },
  update_record: {
    category: "update_record",
    label: "Update record",
    description: "Modify data in a connected tool",
    defaultTier: 2,
    pinned: false,
  },
  spend: {
    category: "spend",
    label: "Spend",
    description: "Commit spend under your configured cap",
    defaultTier: 2,
    pinned: false,
  },
  webhook: {
    category: "webhook",
    label: "Webhook",
    description: "Fire a configured outbound webhook",
    defaultTier: 2,
    pinned: false,
  },
  delete: {
    category: "delete",
    label: "Delete",
    description: "Destructive removal — requires typed confirmation",
    defaultTier: 3,
    pinned: true,
  },
  refund: {
    category: "refund",
    label: "Refund",
    description: "Return money to a customer — requires typed confirmation",
    defaultTier: 3,
    pinned: true,
  },
  payment: {
    category: "payment",
    label: "Payment",
    description: "Move money out — requires typed confirmation",
    defaultTier: 3,
    pinned: true,
  },
  connection_call: {
    category: "connection_call",
    label: "Connected tool",
    description:
      "Run an action on a connected app or MCP tool. Created by the integrations runtime after explicit user action — never proposed by the planner.",
    defaultTier: 2,
    pinned: false,
    plannerSelectable: false,
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export interface SessionRecord {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "agent";
  content: string;
  created_at: string;
}

export interface ActionRecord {
  id: string;
  session_id: string;
  user_id: string;
  category: ActionCategory;
  tier: Tier;
  status: ActionStatus;
  summary: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  veto_reason: string | null;
  injection_flag: boolean;
  /** Set when the model asked for a different tier than the server assigned. */
  tier_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type ActionEventType =
  | "proposed"
  | "approved"
  | "edited"
  | "vetoed"
  | "executing"
  | "executed"
  | "failed"
  | "blocked"
  | "flagged";

export interface ActionEventRecord {
  id: string;
  action_id: string;
  user_id: string;
  type: ActionEventType;
  actor: "user" | "agent" | "system";
  detail: Record<string, unknown>;
  created_at: string;
}

export interface TierSettingRecord {
  user_id: string;
  category: ActionCategory;
  tier: Tier;
}

export interface UsageRecord {
  user_id: string;
  cycle_start: string;
  actions_executed: number;
  limit: number;
}

export interface BetaApplication {
  name: string;
  email: string;
  tools: string;
  workflow: string;
}

export type AccountAuditType =
  | "tier_changed"
  | "integration_connected"
  | "integration_disconnected"
  | "connector_action"
  | "account_deleted"
  | "automation_created"
  | "automation_deleted"
  | "workspace_created"
  | "workspace_deleted"
  | "workspace_member_invited"
  | "workspace_member_removed"
  | "workspace_role_changed"
  | "objective_created"
  | "objective_deleted"
  | "hold_changed"
  | "emergency_stop"
  | "emergency_stop_lifted"
  | "rule_created"
  | "rule_deleted"
  | "trust_changed"
  | "budget_raised"
  | "budget_default_changed"
  | "promo";

/**
 * Single-use promotional offers, tracked one row per (user, offer) so every
 * offer is claimable exactly once per customer, ever. Eligibility is always
 * server-validated against these rows (see src/lib/promos.ts).
 */
export type PromoOffer =
  | "subscribed" // set the first time a subscription goes active (marks a returning customer)
  | "intro_used" // first-month intro coupon applied at checkout
  | "refund_used" // the one lifetime 14-day refund
  | "usage_offer_shown" // the free-tier "you hit 25 — grab $9 first month" card
  | "renewed_once" // set on the first successful renewal (unlocks the annual nudge)
  | "annual_nudge_shown" // the post-renewal "switch to annual" prompt
  | "retention_offered"; // the 50%-off-2-months cancel-flow save

export interface PromoRecord {
  user_id: string;
  offer: PromoOffer;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AccountAuditRecord {
  id: string;
  user_id: string;
  type: AccountAuditType;
  detail: Record<string, unknown>;
  created_at: string;
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";

/** Written ONLY by the Stripe webhook (service role). */
export interface SubscriptionRecord {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string; // PlanId
  interval: string | null; // "monthly" | "annual"
  status: SubscriptionStatus;
  /** unix seconds of the current period end (grace + cancel logic key off this). */
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  /** unix seconds we first observed past_due, for the grace window. */
  past_due_since: number | null;
  /** unix seconds the Stripe subscription was created — powers the 14-day refund window. */
  started_at: number | null;
  updated_at: string;
}

export const BETA_ACTION_LIMIT = 200;

/** Valid status transitions — enforced server-side and in Postgres. */
export const STATUS_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  proposed: ["approved", "vetoed"],
  approved: ["executing"],
  executing: ["executed", "failed"],
  executed: [],
  failed: [],
  vetoed: [],
};

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/* ------------------------------------------------------------ automations */

/**
 * What a recurring rule is allowed to do with what it finds:
 *  - monitor: watch and report only — any tier-2+ proposal a run creates is
 *    auto-vetoed with an honest note; nothing waits on you.
 *  - prepare: the default — runs propose action cards that wait for approval.
 *  - execute: an explicit, per-automation grant — routine (tier-2) proposals
 *    from this rule's runs are approved and executed automatically. Locked
 *    tier-3 actions ALWAYS stay manual, grant or not.
 */
export type AutomationMode = "monitor" | "prepare" | "execute";

/** A recurring mission: a saved command re-run on an interval. */
export interface AutomationRecord {
  id: string;
  user_id: string;
  name: string;
  command: string;
  /** Re-run cadence in hours (1..720). */
  interval_hours: number;
  mode: AutomationMode;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

/** One execution of an automation — always through the normal pipeline. */
export interface AutomationRunRecord {
  id: string;
  automation_id: string;
  user_id: string;
  status: "ok" | "error";
  /** Proposal count on ok; a SAFE error note on error (never a stack). */
  detail: string | null;
  /** The mission (session) this run created, if planning succeeded. */
  session_id: string | null;
  created_at: string;
}

/* ------------------------------------------------------------- objectives */

/**
 * An Objective is an outcome the user wants over time — the layer ABOVE
 * Delegations. Delegations (sessions) are linked to it; cosigno derives
 * what's complete, what's blocked, and what can happen next from the real
 * state of those linked delegations. The user gives the destination; cosigno
 * continuously helps move toward it.
 */
export type ObjectiveStatus = "active" | "achieved" | "archived";

export interface ObjectiveRecord {
  id: string;
  user_id: string;
  title: string;
  /** ISO day the user wants it done by, or null. */
  target_date: string | null;
  status: ObjectiveStatus;
  created_at: string;
  updated_at: string;
}

/** Link between an Objective and a Delegation (session). */
export interface ObjectiveLinkRecord {
  objective_id: string;
  session_id: string;
  user_id: string;
  created_at: string;
}

/* ------------------------------------------------------------- cosigno hold */

/**
 * Cosigno Hold — a user-level authority brake, enforced in the engine before
 * any execution. Nothing new crosses the boundary while held:
 *   none     — normal operation.
 *   external — pause execution of anything requiring approval or signature
 *              (tier ≥ 2). Research and preparation continue; external actions
 *              wait at the boundary until Resume.
 *   all      — pause all execution, including tier-1 auto actions.
 * Base permissions are never changed — Resume restores exactly the prior
 * behavior. Every change is audited.
 */
export type HoldScope = "none" | "external" | "all";

export interface HoldRecord {
  user_id: string;
  scope: HoldScope;
  updated_at: string;
}

/* ----------------------------------------------------- temporary authority */

/**
 * A scoped, time-limited authority grant: "for the next two hours, handle
 * <category> without asking." Always explicit, visible, revocable, and
 * recorded; when it expires, the previous permission level simply applies
 * again (base tier settings are never touched). Only unpinned tier-2
 * categories that don't require SIGN can be granted — locked and
 * outward-facing actions always keep their boundary.
 */
export interface TemporaryAuthorityRecord {
  id: string;
  user_id: string;
  category: ActionCategory;
  /** The temporarily granted tier — always 1 (auto) in v1. */
  tier: Tier;
  expires_at: string;
  /** Optional human note shown with the grant ("internal reschedules only"). */
  note: string | null;
  created_at: string;
  revoked_at: string | null;
}

/* ------------------------------------------------------------- signatures */

/**
 * The user's saved visual signature — an optional convenience for the SIGN
 * interaction (Hold to Sign replays it). It is a product interaction
 * representing approval inside cosigno, NOT automatically a legally binding
 * e-signature; the authenticated, hashed authorization record on each
 * approval event is the underlying proof.
 */
export interface SignatureRecord {
  user_id: string;
  /** Display name sealed onto signed cards ("Signed by …"). */
  name: string;
  /** Small PNG data URI of the drawn signature (bounded server-side). */
  image: string;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------- autopilot */

/** The user's disposition on a detected signal (keyed by its stable key). */
export type SignalStateStatus = "new" | "seen" | "ignored" | "actioned";

export interface SignalStateRecord {
  user_id: string;
  /** Stable signal key from the detection engine (e.g. "revenue_week_drop"). */
  signal_key: string;
  status: SignalStateStatus;
  first_seen: string;
  updated_at: string;
}

/* ----------------------------------------------------------------- memory */

/** A user-saved operational note, fed to the planner as explicit context. */
export interface MemoryRecord {
  id: string;
  user_id: string;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A custom PERMISSION RULE — a user's standing policy over what cosigno may do
 * across their connected tools, in plain language, turned into a visible,
 * editable structured constraint. Rules can only ever make an action MORE
 * restrictive (raise its approval level, or forbid it); they can never lower a
 * boundary. The structured fields are derived deterministically from `text`.
 */
export type RuleRequirement = "auto" | "approve" | "sign" | "never";

export interface RuleCondition {
  /** What the condition tests, if anything. */
  kind: "none" | "amount" | "channel" | "label";
  /** Comparator for an amount condition. */
  op?: ">" | ">=" | "<" | "<=";
  /** Numeric threshold for an amount condition (dollars). */
  value?: number;
  /** Literal match for a channel/label condition (e.g. "#announcements"). */
  match?: string;
}

export interface PermissionRuleRecord {
  id: string;
  user_id: string;
  /** The original natural-language rule, kept verbatim. */
  text: string;
  /** Integration key / category the rule targets, or "any". */
  target: string;
  /** Action verb the rule targets (refund, post, delete…), or "any". */
  verb: string;
  condition: RuleCondition;
  requirement: RuleRequirement;
  /** "low" when the parser couldn't extract clear structure — surfaced to the user. */
  confidence: "high" | "low";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Per-user preferences (memory master switch). */
export interface UserPrefs {
  user_id: string;
  memory_enabled: boolean;
  /** The default action budget every new mission runs under. */
  action_budget: number;
}

/* ------------------------------------------------------------------ files */

/** A text-based file: a deliverable or user document, optionally mission-linked. */
export interface FileRecord {
  id: string;
  user_id: string;
  session_id: string | null;
  name: string;
  /**
   * Files are authored and stored as TEXT. Anything binary a user wants —
   * a PDF, most obviously — is rendered from this text on download, so the
   * stored document stays editable and versioned instead of freezing into a
   * blob nobody can revise.
   */
  mime: "text/plain" | "text/markdown" | "text/csv" | "text/html" | "image/svg+xml";
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------- workspaces */

/**
 * Teams/household v1. Roles gate DELEGATED APPROVALS only: an owner/approver
 * may approve or veto a workspace-mate's tier-2 proposals through the same
 * engine door. Tier-3 approvals stay personal to the action's owner.
 */
export type WorkspaceRole = "owner" | "approver" | "member";

export interface WorkspaceRecord {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
}

export interface WorkspaceMemberRecord {
  id: string;
  workspace_id: string;
  /** null until the invited email signs in and the invite is accepted. */
  user_id: string | null;
  email: string;
  role: WorkspaceRole;
  status: "invited" | "active";
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------ durable missions */

/**
 * The durable mission engine. Missions progress SERVER-SIDE on ticks; state
 * lives in these records, never in a browser session. Consequential steps
 * link an action card (action_id) and block on the same approval door as
 * everything else.
 */
export type MissionRunState =
  | "queued"
  | "running"
  | "awaiting_input"
  | "awaiting_approval"
  | "retrying"
  | "verifying"
  | "paused"
  | "completed"
  | "partial"
  | "failed"
  | "stopped"
  | "blocked";

/**
 * Mission states the background scheduler picks up.
 *
 * `awaiting_approval` MUST be here, and its absence was a deep bug: a mission
 * parked on a signature was invisible to every tick, so approving a card did
 * nothing until its owner happened to have the page open to drive the engine
 * by hand. The product's central promise — "the mission resumes automatically
 * after you decide" — was only true with a tab open, which is the one
 * situation background execution exists to remove.
 *
 * Settling an approval-parked mission is cheap (it reads the card's status and
 * either advances or leaves it alone), so including it costs a row read per
 * tick and buys the promise actually holding.
 *
 * Deliberately excluded: awaiting_input (waiting on a human answer, and no
 * amount of ticking produces one), paused/stopped (a person said don't), and
 * every terminal state.
 */
export const RUNNABLE_MISSION_STATES = [
  "queued",
  "running",
  "awaiting_approval",
  "retrying",
  "verifying",
] as const satisfies readonly MissionRunState[];

/** A structured question blocking one step — never a dead-end failure. */
export interface MissionQuestion {
  step_id: string;
  question: string;
  why: string;
  options: string[];
  recommended?: string;
  /** What the answer changes about the mission. */
  effect: string;
}

export interface MissionRecord {
  id: string;
  user_id: string;
  session_id: string;
  goal: string;
  state: MissionRunState;
  plan_version: number;
  pending_question: MissionQuestion | null;
  receipt: Record<string, unknown> | null;
  error: string | null;
  /** Tick concurrency lease — set while a worker is advancing this mission. */
  lease_owner: string | null;
  lease_expires_at: string | null;
  /** Internal cost/resource counters + the engine's own cap (cents). */
  tool_calls: number;
  browser_actions: number;
  budget_cents: number;
  /**
   * How many things this mission may CHANGE outside cosigno before it stops
   * and asks. `null` follows the workspace default, so raising the default
   * lifts every mission that never chose its own.
   */
  action_budget: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type MissionStepState =
  | "ready"
  | "running"
  | "awaiting_input"
  | "awaiting_approval"
  | "retrying"
  | "verifying"
  | "completed"
  | "failed"
  | "vetoed"
  | "skipped"
  | "canceled";

export interface MissionSourceRef {
  name: string;
  detail: string;
  simulated?: boolean;
}

export interface MissionStepRecord {
  id: string;
  mission_id: string;
  user_id: string;
  idx: number;
  purpose: string;
  operator: string;
  tool: string;
  state: MissionStepState;
  depends_on: number[];
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  sources: MissionSourceRef[];
  action_id: string | null;
  retry_count: number;
  max_retries: number;
  error: string | null;
  verification: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------- browser operator */

export type BrowserSessionStatus =
  | "requested"
  | "starting"
  | "active"
  | "waiting_for_page"
  | "waiting_for_user_login"
  | "waiting_for_approval"
  | "navigating"
  | "extracting"
  | "interacting"
  | "downloading"
  | "verifying"
  | "paused"
  | "expired"
  | "blocked"
  | "failed_safely"
  | "stopped"
  | "completed";

export interface BrowserSessionRecord {
  id: string;
  user_id: string;
  mission_id: string;
  operator: string;
  provider: string;
  simulated: boolean;
  status: BrowserSessionStatus;
  objective: string;
  current_url: string | null;
  page_title: string | null;
  provider_ref: string | null;
  last_action: string | null;
  stop_reason: string | null;
  /** Bounded JPEG data URI of the current page (or a labeled sandbox placeholder). */
  screenshot_ref: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A product actually found on a page during browser research. Only fields
 * REALLY present on the page are set — anything the page didn't state is
 * null, never invented. Content is untrusted page data.
 */
export interface BrowserProductRecord {
  id: string;
  user_id: string;
  mission_id: string;
  session_id: string;
  name: string;
  brand: string;
  current_price: number | null;
  currency: string;
  retailer: string;
  product_url: string;
  processor: string | null;
  memory: string | null;
  storage: string | null;
  display: string | null;
  graphics: string | null;
  battery_claim: string | null;
  availability: string | null;
  warranty: string | null;
  return_policy: string | null;
  source_title: string;
  /** True when the page content tried to steer the agent (recorded, never obeyed). */
  injection_flag: boolean;
  simulated: boolean;
  accessed_at: string;
  created_at: string;
}

export type BrowserActionState =
  | "proposed"
  | "ready"
  | "running"
  | "awaiting_approval"
  | "submitted"
  | "completed"
  | "failed"
  | "skipped"
  | "canceled"
  | "verifying";

export interface BrowserActionRecord {
  id: string;
  session_id: string;
  mission_id: string;
  user_id: string;
  idx: number;
  purpose: string;
  kind: string;
  target: string | null;
  risk: "read" | "consequential";
  changes_external: boolean;
  requires_approval: boolean;
  action_id: string | null;
  state: BrowserActionState;
  detail: Record<string, unknown>;
  verification: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------ mission sources */

/** One picture the operator can genuinely see. `data` is raw base64. */
export interface SourceMediaImage {
  mime: string;
  data: string;
  /** Caption the operator sees, e.g. "receipt.jpg" or "frame at 0:12". */
  label: string;
}

/** A file, link, or video the user attaches to a mission from the ask box. */
export type MissionSourceKind = "file" | "link" | "video";

export type MissionSourceStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "failed"
  | "unsupported"
  | "checking"
  | "reading"
  | "login_required"
  | "blocked"
  | "could_not_access";

export interface MissionSourceRecord {
  id: string;
  user_id: string;
  /** null while staged in the ask box; set when the mission is created. */
  mission_id: string | null;
  kind: MissionSourceKind;
  /** filename (file) or page title (link). */
  name: string;
  /** mime type (file) or domain (link). */
  subtype: string;
  size_bytes: number;
  status: MissionSourceStatus;
  /** extracted, bounded text summary (untrusted content — data only). */
  summary: string;
  /**
   * The actual pictures for this source: the image itself, or the frames
   * sampled from a video. These are what the operator LOOKS AT. A source that
   * should be seen and has none here was not seen — the operator is told so
   * rather than left to guess from the filename.
   */
  media: SourceMediaImage[];
  injection_flag: boolean;
  detail: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
