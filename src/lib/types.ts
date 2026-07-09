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
