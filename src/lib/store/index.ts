import type {
  AutomationRecord,
  AutomationRunRecord,
  MemoryRecord,
  PermissionRuleRecord,
  RuleCondition,
  RuleRequirement,
  UserPrefs,
  FileRecord,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  WorkspaceRole,
  MissionRecord,
  MissionStepRecord,
  MissionRunState,
  MissionStepState,
  MissionQuestion,
  MissionSourceRef,
  BrowserSessionRecord,
  BrowserActionRecord,
  BrowserSessionStatus,
  BrowserProductRecord,
  MissionSourceRecord,
  MissionSourceKind,
  MissionSourceStatus,
  AccountAuditRecord,
  ActionEventRecord,
  ActionEventType,
  ActionRecord,
  ActionStatus,
  BetaApplication,
  MessageRecord,
  PromoOffer,
  PromoRecord,
  HoldRecord,
  ObjectiveLinkRecord,
  ObjectiveRecord,
  SessionRecord,
  SignalStateRecord,
  SignalStateStatus,
  SignatureRecord,
  TemporaryAuthorityRecord,
  SubscriptionRecord,
  TierSettingRecord,
  UsageRecord,
} from "../types";
import type {
  ConnectionRecord,
  ConnectionStatus,
  McpToolRecord,
} from "../integrations/types";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";

/** New-connection insert — encrypted_credentials is already ciphertext. */
export interface ConnectionInsert {
  user_id: string;
  provider_key: string;
  kind: ConnectionRecord["kind"];
  display_name: string;
  auth_type: ConnectionRecord["auth_type"];
  encrypted_credentials: string | null;
  scopes?: string | null;
  metadata?: Record<string, unknown>;
  status?: ConnectionStatus;
}

export interface AutomationInsert {
  user_id: string;
  name: string;
  command: string;
  interval_hours: number;
  mode: AutomationRecord["mode"];
  next_run_at: string;
}

export interface FileInsert {
  user_id: string;
  session_id?: string | null;
  name: string;
  mime: FileRecord["mime"];
  content: string;
}

/** New permission-rule insert — the parsed structure plus the original text. */
export interface PermissionRuleInsert {
  text: string;
  target: string;
  verb: string;
  condition: RuleCondition;
  requirement: RuleRequirement;
  confidence: PermissionRuleRecord["confidence"];
}

export interface ConnectionPatch {
  status?: ConnectionStatus;
  encrypted_credentials?: string | null;
  scopes?: string | null;
  display_name?: string;
  metadata?: Record<string, unknown>;
  last_health_at?: string | null;
}

/**
 * A partial update to one cached MCP tool. Enable/consent is the everyday
 * path; the classification fields are written only when a human settles a
 * category the classifier wasn't sure about — which is why `classified_by`
 * is part of the patch rather than inferred, so that decision is explicit at
 * every call site that records one.
 */
export interface McpToolPatch {
  enabled?: boolean;
  consented_at?: string | null;
  category?: string | null;
  confidence?: number | null;
  classified_by?: "auto" | "user" | null;
  sensitive?: boolean;
}

export interface OAuthStateRow {
  state: string;
  user_id: string;
  provider_key: string;
  code_verifier?: string | null;
  redirect_uri: string;
  expires_at: string;
}

export interface MissionInsert {
  user_id: string;
  session_id: string;
  goal: string;
}

export interface MissionStepInsert {
  mission_id: string;
  user_id: string;
  idx: number;
  purpose: string;
  operator: string;
  tool: string;
  depends_on: number[];
  input?: Record<string, unknown>;
  max_retries?: number;
  /** Initial state — defaults to "ready". */
  state?: MissionStepState;
  sources?: MissionSourceRef[];
}

export interface BrowserSessionInsert {
  user_id: string;
  mission_id: string;
  operator: string;
  provider: string;
  simulated: boolean;
  objective: string;
  provider_ref?: string | null;
  expires_at?: string | null;
}

export interface BrowserActionInsert {
  session_id: string;
  mission_id: string;
  user_id: string;
  idx: number;
  purpose: string;
  kind: string;
  target?: string | null;
  risk: "read" | "consequential";
  changes_external: boolean;
  requires_approval: boolean;
  state?: BrowserActionRecord["state"];
  detail?: Record<string, unknown>;
}

/** A product finding — every nullable field defaults to null (never invented). */
export interface BrowserProductInsert {
  user_id: string;
  mission_id: string;
  session_id: string;
  name: string;
  brand?: string;
  current_price?: number | null;
  currency?: string;
  retailer?: string;
  product_url: string;
  processor?: string | null;
  memory?: string | null;
  storage?: string | null;
  display?: string | null;
  graphics?: string | null;
  battery_claim?: string | null;
  availability?: string | null;
  warranty?: string | null;
  return_policy?: string | null;
  source_title?: string;
  injection_flag?: boolean;
  simulated?: boolean;
  accessed_at?: string;
}

export interface MissionSourceInsert {
  user_id: string;
  kind: MissionSourceKind;
  name: string;
  subtype?: string;
  size_bytes?: number;
  status: MissionSourceStatus;
  summary?: string;
  injection_flag?: boolean;
  detail?: Record<string, unknown>;
}

// Re-exported so engine/tests can type against the store module alone.
export type { MissionQuestion, MissionRunState };

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

/** Filter for cheap DB-side action counts (no rows transferred). */
export interface ActionCountFilter {
  status?: ActionStatus;
  injection_flag?: boolean;
  /** Only actions created at/after this ISO timestamp. */
  since?: string;
}

/**
 * The narrow action shape the state/stream assembly needs — fetched with a
 * column projection so polled endpoints never transfer payload/result JSON.
 */
export type ActionHead = Pick<
  ActionRecord,
  "id" | "session_id" | "status" | "category" | "tier" | "summary" | "created_at"
>;

/** Minimal per-session action status, for momentum roll-ups. */
export type ActionStatusRow = Pick<ActionRecord, "id" | "session_id" | "status">;

/** A persisted AI-usage row (ledger insert + created_at). */
export type StoredAiUsage = import("../ai/costs").AiUsageRow & { created_at: string };

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
  /** Narrow projection of the newest actions — no payload/result transfer. */
  listActionHeads(userId: string, limit: number): Promise<ActionHead[]>;
  /** Per-session action statuses for the given sessions only. */
  listActionStatusesForSessions(
    userId: string,
    sessionIds: string[]
  ): Promise<ActionStatusRow[]>;
  /** DB-side count of matching actions — zero rows transferred. */
  countActions(userId: string, filter?: ActionCountFilter): Promise<number>;
  /** DB-side count of the user's sessions. */
  countSessions(userId: string): Promise<number>;
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
  /**
   * Events in ascending time order. When `limit` is set, returns the NEWEST
   * `limit` events (still ascending) — bounded in the query, not in JS.
   */
  listEvents(
    userId: string,
    actionId?: string,
    limit?: number
  ): Promise<ActionEventRecord[]>;
  /** Events for exactly these actions, ascending — no full-history scan. */
  listEventsForActions(
    userId: string,
    actionIds: string[]
  ): Promise<ActionEventRecord[]>;

  getTierSettings(userId: string): Promise<TierSettingRecord[]>;
  setTierSetting(
    userId: string,
    category: TierSettingRecord["category"],
    tier: TierSettingRecord["tier"]
  ): Promise<void>;

  getUsage(userId: string): Promise<UsageRecord>;
  /**
   * `cycleStart` (from a getUsage call earlier in the same request) skips the
   * internal usage re-fetch — one fewer round trip on the execution path.
   */
  incrementUsage(userId: string, cycleStart?: string): Promise<UsageRecord>;

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

  /* --- Connections v2: MCP servers, native adapters, custom API tools.
     Credentials are stored ENCRYPTED (ciphertext in) and returned as-is
     (decryption is the caller's job, in the runtime layer). --- */
  createConnection(input: ConnectionInsert): Promise<ConnectionRecord>;
  getConnection(userId: string, id: string): Promise<ConnectionRecord | null>;
  listConnections(userId: string): Promise<ConnectionRecord[]>;
  updateConnection(userId: string, id: string, patch: ConnectionPatch): Promise<void>;
  deleteConnection(userId: string, id: string): Promise<void>;
  /** Replace the cached tool list for an MCP connection (validated upstream). */
  saveMcpTools(
    userId: string,
    connectionId: string,
    tools: Omit<McpToolRecord, "connection_id">[]
  ): Promise<void>;
  listMcpTools(userId: string, connectionId: string): Promise<McpToolRecord[]>;
  getMcpTool(userId: string, connectionId: string, name: string): Promise<McpToolRecord | null>;
  setMcpTool(
    userId: string,
    connectionId: string,
    name: string,
    patch: McpToolPatch
  ): Promise<void>;
  /** OAuth CSRF/PKCE state — created before redirect, consumed once on callback. */
  createOAuthState(row: OAuthStateRow): Promise<void>;
  consumeOAuthState(state: string): Promise<OAuthStateRow | null>;

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

  /* -- automations (recurring missions) -- */
  createAutomation(input: AutomationInsert): Promise<AutomationRecord>;
  listAutomations(userId: string): Promise<AutomationRecord[]>;
  getAutomation(userId: string, id: string): Promise<AutomationRecord | null>;
  updateAutomation(
    userId: string,
    id: string,
    patch: Partial<Pick<AutomationRecord, "name" | "command" | "interval_hours" | "mode" | "enabled" | "last_run_at" | "next_run_at">>
  ): Promise<AutomationRecord | null>;
  deleteAutomation(userId: string, id: string): Promise<void>;
  /** Enabled automations due to run (next_run_at <= now), across all users — tick only. */
  listDueAutomations(limit: number): Promise<AutomationRecord[]>;
  createAutomationRun(input: Omit<AutomationRunRecord, "id" | "created_at">): Promise<AutomationRunRecord>;
  listAutomationRuns(userId: string, automationId: string, limit?: number): Promise<AutomationRunRecord[]>;

  /* -- objectives (outcomes owned over time; delegations link to them) -- */
  createObjective(
    userId: string,
    title: string,
    targetDate: string | null
  ): Promise<ObjectiveRecord>;
  listObjectives(userId: string): Promise<ObjectiveRecord[]>;
  getObjective(userId: string, id: string): Promise<ObjectiveRecord | null>;
  updateObjective(
    userId: string,
    id: string,
    patch: Partial<Pick<ObjectiveRecord, "title" | "target_date" | "status">>
  ): Promise<ObjectiveRecord | null>;
  deleteObjective(userId: string, id: string): Promise<void>;
  linkObjectiveDelegation(userId: string, objectiveId: string, sessionId: string): Promise<void>;
  unlinkObjectiveDelegation(userId: string, objectiveId: string, sessionId: string): Promise<void>;
  /** Links for one objective, or all of the user's links when objectiveId omitted. */
  listObjectiveLinks(userId: string, objectiveId?: string): Promise<ObjectiveLinkRecord[]>;

  /* -- cosigno hold (user-level authority brake; enforced in the engine) -- */
  getHold(userId: string): Promise<HoldRecord>;
  setHold(userId: string, scope: HoldRecord["scope"]): Promise<HoldRecord>;

  /* -- temporary authority (scoped, expiring permission grants) -- */
  grantTemporaryAuthority(
    userId: string,
    category: TemporaryAuthorityRecord["category"],
    expiresAt: string,
    note: string | null
  ): Promise<TemporaryAuthorityRecord>;
  /** Live + recent grants for the user (expired ones may be filtered by callers). */
  listTemporaryAuthority(userId: string): Promise<TemporaryAuthorityRecord[]>;
  revokeTemporaryAuthority(userId: string, id: string): Promise<TemporaryAuthorityRecord | null>;

  /* -- saved signature (Hold to Sign convenience; image bounded upstream) -- */
  getSignature(userId: string): Promise<SignatureRecord | null>;
  saveSignature(userId: string, name: string, image: string): Promise<SignatureRecord>;
  deleteSignature(userId: string): Promise<void>;

  /* -- autopilot (signal dispositions + last-viewed marker) -- */
  /**
   * Ensure a state row exists for every currently-detected signal key
   * (missing keys are inserted as "new"), then return the rows for exactly
   * those keys. Dispositions on keys not passed are left untouched.
   */
  ensureSignalStates(userId: string, keys: string[]): Promise<SignalStateRecord[]>;
  /** Set the disposition on one signal (ignore / acted / seen). */
  setSignalStatus(
    userId: string,
    signalKey: string,
    status: SignalStateStatus
  ): Promise<SignalStateRecord | null>;
  /** Flip every "new" signal to "seen" — called when the user views Autopilot. */
  markSignalsSeen(userId: string): Promise<void>;
  getAutopilotViewedAt(userId: string): Promise<string | null>;
  setAutopilotViewedAt(userId: string, iso: string): Promise<void>;

  /* -- memory (user-controlled planner context) -- */
  createMemory(userId: string, content: string): Promise<MemoryRecord>;
  listMemories(userId: string): Promise<MemoryRecord[]>;
  updateMemory(
    userId: string,
    id: string,
    patch: Partial<Pick<MemoryRecord, "content" | "enabled">>
  ): Promise<MemoryRecord | null>;
  deleteMemory(userId: string, id: string): Promise<void>;
  getPrefs(userId: string): Promise<UserPrefs>;
  setMemoryEnabled(userId: string, enabled: boolean): Promise<void>;
  /** The workspace default: how many changes a mission may make before it asks. */
  setActionBudget(userId: string, budget: number): Promise<void>;

  /* -- internal AI cost ledger (never exposed to clients) -- */
  recordAiUsage(row: import("../ai/costs").AiUsageRow): Promise<void>;
  aiCostForMission(userId: string, missionId: string): Promise<number>;
  aiCostForUserMonth(userId: string): Promise<number>;
  /** Raw rows since a timestamp, for the internal dashboard's aggregation. */
  listAiUsageSince(sinceIso: string): Promise<StoredAiUsage[]>;

  /* -- permission rules (structured, tighten-only policy over tools) -- */
  createPermissionRule(userId: string, input: PermissionRuleInsert): Promise<PermissionRuleRecord>;
  listPermissionRules(userId: string): Promise<PermissionRuleRecord[]>;
  updatePermissionRule(
    userId: string,
    id: string,
    patch: Partial<Pick<PermissionRuleRecord, "enabled" | "requirement">>
  ): Promise<PermissionRuleRecord | null>;
  deletePermissionRule(userId: string, id: string): Promise<void>;

  /* -- files (text-based, mission-aware) -- */
  createFile(input: FileInsert): Promise<FileRecord>;
  listFiles(userId: string): Promise<FileRecord[]>;
  getFile(userId: string, id: string): Promise<FileRecord | null>;
  /** Content/name edits bump `version`. */
  updateFile(
    userId: string,
    id: string,
    patch: Partial<Pick<FileRecord, "name" | "content">>
  ): Promise<FileRecord | null>;
  deleteFile(userId: string, id: string): Promise<void>;

  /* -- durable missions (server-side multi-step work, advanced on ticks) -- */
  createMission(input: MissionInsert): Promise<MissionRecord>;
  getMission(userId: string, id: string): Promise<MissionRecord | null>;
  listMissions(userId: string, limit?: number): Promise<MissionRecord[]>;
  updateMission(
    userId: string,
    id: string,
    patch: Partial<
      Pick<
        MissionRecord,
        | "state" | "plan_version" | "pending_question" | "receipt" | "error" | "completed_at"
        | "lease_owner" | "lease_expires_at" | "tool_calls" | "browser_actions" | "budget_cents" | "action_budget"
      >
    >
  ): Promise<MissionRecord | null>;
  /** Missions any user owns that the tick should advance (queued/running/retrying/verifying). */
  listRunnableMissions(limit: number): Promise<MissionRecord[]>;
  /**
   * Atomically claim a tick lease on a mission: succeeds only if no live lease
   * exists (or the prior one expired). Two workers can never both win — the
   * loser gets null and skips. Returns the leased mission on success.
   */
  claimMissionLease(missionId: string, owner: string, ttlMs: number): Promise<MissionRecord | null>;
  releaseMissionLease(missionId: string, owner: string): Promise<void>;

  /* -- browser operator (sessions + structured actions) -- */
  createBrowserSession(input: BrowserSessionInsert): Promise<BrowserSessionRecord>;
  getBrowserSession(userId: string, id: string): Promise<BrowserSessionRecord | null>;
  listBrowserSessions(userId: string, missionId: string): Promise<BrowserSessionRecord[]>;
  updateBrowserSession(
    userId: string,
    id: string,
    patch: Partial<
      Pick<
        BrowserSessionRecord,
        | "status"
        | "current_url"
        | "page_title"
        | "provider_ref"
        | "last_action"
        | "stop_reason"
        | "screenshot_ref"
        | "expires_at"
      >
    >
  ): Promise<BrowserSessionRecord | null>;
  createBrowserAction(input: BrowserActionInsert): Promise<BrowserActionRecord>;
  listBrowserActions(userId: string, sessionId: string): Promise<BrowserActionRecord[]>;
  createBrowserProduct(input: BrowserProductInsert): Promise<BrowserProductRecord>;
  listBrowserProducts(userId: string, missionId: string): Promise<BrowserProductRecord[]>;
  updateBrowserAction(
    userId: string,
    id: string,
    patch: Partial<
      Pick<BrowserActionRecord, "state" | "action_id" | "detail" | "verification">
    >
  ): Promise<BrowserActionRecord | null>;
  createMissionSteps(steps: MissionStepInsert[]): Promise<MissionStepRecord[]>;
  listMissionSteps(userId: string, missionId: string): Promise<MissionStepRecord[]>;

  /* -- mission sources (uploaded files + attached links) -- */
  createMissionSource(input: MissionSourceInsert): Promise<MissionSourceRecord>;
  getMissionSource(userId: string, id: string): Promise<MissionSourceRecord | null>;
  /** Staged sources (not yet attached to a mission) for the ask box. */
  listStagedSources(userId: string): Promise<MissionSourceRecord[]>;
  listMissionSources(userId: string, missionId: string): Promise<MissionSourceRecord[]>;
  deleteMissionSource(userId: string, id: string): Promise<void>;
  /** Attach staged sources to a mission (sets mission_id) — returns the count attached. */
  attachSourcesToMission(userId: string, sourceIds: string[], missionId: string): Promise<number>;
  updateMissionStep(
    userId: string,
    id: string,
    patch: Partial<
      Pick<
        MissionStepRecord,
        | "state"
        | "input"
        | "output"
        | "sources"
        | "action_id"
        | "retry_count"
        | "error"
        | "verification"
        | "started_at"
        | "completed_at"
      >
    >
  ): Promise<MissionStepRecord | null>;

  /* -- workspaces (teams/household: shared visibility + delegated approvals) -- */
  /** Create a workspace with the creator as its active owner member. */
  createWorkspace(userId: string, email: string, name: string): Promise<WorkspaceRecord>;
  /** The workspace a user is an ACTIVE member of (v1: at most one). */
  getWorkspaceForUser(userId: string): Promise<WorkspaceRecord | null>;
  getWorkspace(id: string): Promise<WorkspaceRecord | null>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]>;
  /** Add an invited member row (unique per email within the workspace). */
  inviteWorkspaceMember(
    workspaceId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">
  ): Promise<WorkspaceMemberRecord>;
  /**
   * Bind pending invites for this email to the user and activate the first
   * (v1: one workspace per user). Returns the activated membership, if any.
   */
  acceptWorkspaceInvites(userId: string, email: string): Promise<WorkspaceMemberRecord | null>;
  updateWorkspaceMember(
    workspaceId: string,
    memberId: string,
    patch: Partial<Pick<WorkspaceMemberRecord, "role">>
  ): Promise<WorkspaceMemberRecord | null>;
  removeWorkspaceMember(workspaceId: string, memberId: string): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  /** Proposed actions across a set of users — delegated-decision listing. */
  listProposedActionsForUsers(userIds: string[], limit?: number): Promise<ActionRecord[]>;

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
      // The in-memory store is for local development AND the opt-in public
      // sandbox (COSIGNO_PUBLIC_MODE=1). Production without either fails closed
      // rather than silently serving a non-persistent, shared backend.
      if (process.env.NODE_ENV === "production" && process.env.COSIGNO_PUBLIC_MODE !== "1") {
        throw new Error("supabase_not_configured");
      }
      globalStore.__cosignoStore = new MemoryStore();
    }
  }
  return globalStore.__cosignoStore;
}
