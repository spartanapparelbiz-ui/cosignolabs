import type {
  AccountAuditRecord,
  ActionEventRecord,
  ActionEventType,
  ActionRecord,
  ActionStatus,
  BetaApplication,
  MessageRecord,
  PromoOffer,
  PromoRecord,
  SessionRecord,
  SubscriptionRecord,
  TierSettingRecord,
  UsageRecord,
} from "../types";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";

export interface ActionInsert {
  session_id: string;
  user_id: string;
  category: ActionRecord["category"];
  tier: ActionRecord["tier"];
  summary: string;
  payload: Record<string, unknown>;
  injection_flag: boolean;
  tier_note: string | null;
}

export interface ActivityFilter {
  status?: ActionStatus;
  tier?: number;
  category?: string;
  session_id?: string;
  limit?: number;
}

/**
 * Storage boundary for everything the product persists. Two backends:
 *  - SupabaseStore: production (Postgres + RLS + realtime).
 *  - MemoryStore: local development / demo mode when Supabase env vars are
 *    absent, so the whole approval loop works out of the box.
 * All writes flow through server routes; the client never talks to these
 * tables directly for status changes.
 */
export interface Store {
  createSession(userId: string, title: string): Promise<SessionRecord>;
  getSession(userId: string, id: string): Promise<SessionRecord | null>;
  listSessions(userId: string): Promise<SessionRecord[]>;

  addMessage(
    userId: string,
    sessionId: string,
    role: "user" | "agent",
    content: string
  ): Promise<MessageRecord>;
  listMessages(userId: string, sessionId: string): Promise<MessageRecord[]>;

  createAction(input: ActionInsert): Promise<ActionRecord>;
  getAction(userId: string, id: string): Promise<ActionRecord | null>;
  listActions(userId: string, filter?: ActivityFilter): Promise<ActionRecord[]>;
  /**
   * The ONLY path that mutates action status. Enforces the state machine;
   * throws on an invalid transition.
   */
  transitionAction(
    userId: string,
    id: string,
    to: ActionStatus,
    patch?: Partial<
      Pick<ActionRecord, "result" | "veto_reason" | "payload" | "summary">
    >
  ): Promise<ActionRecord>;
  updateActionProposal(
    userId: string,
    id: string,
    patch: Partial<Pick<ActionRecord, "payload" | "summary">>
  ): Promise<ActionRecord>;

  logEvent(
    userId: string,
    actionId: string,
    type: ActionEventType,
    actor: ActionEventRecord["actor"],
    detail?: Record<string, unknown>
  ): Promise<ActionEventRecord>;
  listEvents(userId: string, actionId?: string): Promise<ActionEventRecord[]>;

  getTierSettings(userId: string): Promise<TierSettingRecord[]>;
  setTierSetting(
    userId: string,
    category: TierSettingRecord["category"],
    tier: TierSettingRecord["tier"]
  ): Promise<void>;

  getUsage(userId: string): Promise<UsageRecord>;
  incrementUsage(userId: string): Promise<UsageRecord>;

  createBetaApplication(app: BetaApplication): Promise<void>;

  /** Subscription state — written only by the Stripe webhook (service role). */
  getSubscription(userId: string): Promise<SubscriptionRecord | null>;
  upsertSubscription(sub: SubscriptionRecord): Promise<void>;
  /** Look up a subscription row by Stripe customer id (webhook path). */
  getSubscriptionByCustomer(customerId: string): Promise<SubscriptionRecord | null>;

  /** Connected integration keys for a user (enforced against the plan). */
  listIntegrations(userId: string): Promise<string[]>;
  setIntegration(userId: string, key: string, connected: boolean): Promise<void>;
  /** connected_at timestamps keyed by integration key. */
  integrationConnectedAt(userId: string): Promise<Record<string, string>>;

  /** Account audit trail (tier changes, integration changes, deletion). */
  logAudit(
    userId: string,
    type: AccountAuditRecord["type"],
    detail?: Record<string, unknown>
  ): Promise<void>;
  listAudit(userId: string, limit?: number): Promise<AccountAuditRecord[]>;

  /**
   * Single-use promotional offers. `claimPromo` records the offer atomically
   * and returns false if the customer already claimed it — the one-time gate
   * every offer relies on. `hasPromo`/`listPromos` are read-only checks.
   */
  hasPromo(userId: string, offer: PromoOffer): Promise<boolean>;
  claimPromo(userId: string, offer: PromoOffer, detail?: Record<string, unknown>): Promise<boolean>;
  listPromos(userId: string): Promise<PromoRecord[]>;
  /** Earliest activity timestamp (unix seconds) — a stand-in for signup date. */
  firstSeenAt(userId: string): Promise<number | null>;

  /** Cascade-delete everything owned by a user (account deletion). */
  deleteAllUserData(userId: string): Promise<void>;
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

const globalStore = globalThis as unknown as { __cosignoStore?: Store };

export function getStore(): Store {
  if (!globalStore.__cosignoStore) {
    if (supabaseConfigured()) {
      globalStore.__cosignoStore = new SupabaseStore();
    } else {
      // The in-memory store exists for local development only. Production
      // fails closed rather than silently serving a non-persistent,
      // shared-user backend.
      if (process.env.NODE_ENV === "production") {
        throw new Error("supabase_not_configured");
      }
      globalStore.__cosignoStore = new MemoryStore();
    }
  }
  return globalStore.__cosignoStore;
}
