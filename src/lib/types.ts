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

/** A recurring mission: a saved command re-run on an interval. */
export interface AutomationRecord {
  id: string;
  user_id: string;
  name: string;
  command: string;
  /** Re-run cadence in hours (1..720). */
  interval_hours: number;
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

/** Per-user preferences (memory master switch). */
export interface UserPrefs {
  user_id: string;
  memory_enabled: boolean;
}

/* ------------------------------------------------------------------ files */

/** A text-based file: a deliverable or user document, optionally mission-linked. */
export interface FileRecord {
  id: string;
  user_id: string;
  session_id: string | null;
  name: string;
  mime: "text/plain" | "text/markdown" | "text/csv";
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
