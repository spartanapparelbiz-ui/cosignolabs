import { randomUUID } from "crypto";
import {
  AccountAuditRecord,
  ActionEventRecord,
  ActionEventType,
  ActionRecord,
  ActionStatus,
  BETA_ACTION_LIMIT,
  BetaApplication,
  canTransition,
  MessageRecord,
  PromoOffer,
  PromoRecord,
  SessionRecord,
  SubscriptionRecord,
  TierSettingRecord,
  UsageRecord,
  AutomationRecord,
  AutomationRunRecord,
  MemoryRecord,
  UserPrefs,
  FileRecord,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  WorkspaceRole,
  MissionRecord,
  MissionStepRecord,
  BrowserSessionRecord,
  BrowserActionRecord,
  MissionSourceRecord,
} from "../types";
import type {
  ActionInsert,
  ActivityFilter,
  ConnectionInsert,
  ConnectionPatch,
  OAuthStateRow,
  Store,
} from "./index";
import type {
  ConnectionRecord,
  McpToolRecord,
} from "../integrations/types";

function nowIso() {
  return new Date().toISOString();
}

function cycleStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/**
 * In-memory backend for demo mode / local development. Mirrors the exact
 * server-side guarantees of the Supabase backend: status only ever changes
 * through transitionAction, which validates the state machine.
 */
export class MemoryStore implements Store {
  private sessions: SessionRecord[] = [];
  private messages: MessageRecord[] = [];
  private actions: ActionRecord[] = [];
  private events: ActionEventRecord[] = [];
  private tierSettings: TierSettingRecord[] = [];
  private usage = new Map<string, UsageRecord>();
  private betaApplications: (BetaApplication & { created_at: string })[] = [];

  async createSession(userId: string, title: string): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: randomUUID(),
      user_id: userId,
      title,
      created_at: nowIso(),
    };
    this.sessions.unshift(session);
    return session;
  }

  async getSession(userId: string, id: string): Promise<SessionRecord | null> {
    return (
      this.sessions.find((s) => s.id === id && s.user_id === userId) ?? null
    );
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    return this.sessions.filter((s) => s.user_id === userId);
  }

  async addMessage(
    userId: string,
    sessionId: string,
    role: "user" | "agent",
    content: string
  ): Promise<MessageRecord> {
    const message: MessageRecord = {
      id: randomUUID(),
      session_id: sessionId,
      user_id: userId,
      role,
      content,
      created_at: nowIso(),
    };
    this.messages.push(message);
    return message;
  }

  async listMessages(userId: string, sessionId: string): Promise<MessageRecord[]> {
    return this.messages.filter(
      (m) => m.session_id === sessionId && m.user_id === userId
    );
  }

  async createAction(input: ActionInsert): Promise<ActionRecord> {
    const action: ActionRecord = {
      id: randomUUID(),
      session_id: input.session_id,
      user_id: input.user_id,
      category: input.category,
      tier: input.tier,
      status: "proposed",
      summary: input.summary,
      payload: input.payload,
      result: null,
      veto_reason: null,
      injection_flag: input.injection_flag,
      tier_note: input.tier_note,
      created_at: nowIso(),
      resolved_at: null,
    };
    this.actions.unshift(action);
    return action;
  }

  async getAction(userId: string, id: string): Promise<ActionRecord | null> {
    return this.actions.find((a) => a.id === id && a.user_id === userId) ?? null;
  }

  async listActions(
    userId: string,
    filter: ActivityFilter = {}
  ): Promise<ActionRecord[]> {
    let rows = this.actions.filter((a) => a.user_id === userId);
    if (filter.session_id) rows = rows.filter((a) => a.session_id === filter.session_id);
    if (filter.status) rows = rows.filter((a) => a.status === filter.status);
    if (filter.tier) rows = rows.filter((a) => a.tier === filter.tier);
    if (filter.category) rows = rows.filter((a) => a.category === filter.category);
    return rows.slice(0, filter.limit ?? 500);
  }

  async transitionAction(
    userId: string,
    id: string,
    to: ActionStatus,
    patch: Partial<
      Pick<ActionRecord, "result" | "veto_reason" | "payload" | "summary">
    > = {}
  ): Promise<ActionRecord> {
    const action = await this.getAction(userId, id);
    if (!action) throw new Error("action_not_found");
    if (!canTransition(action.status, to)) {
      throw new Error(`invalid_transition:${action.status}->${to}`);
    }
    // State-machine-level injection containment: a flagged card can never
    // start executing, regardless of tier, approvals, or caller bugs.
    if ((to === "executing" || to === "approved") && action.injection_flag) {
      throw new Error("injection_blocked");
    }
    action.status = to;
    if (patch.result !== undefined) action.result = patch.result;
    if (patch.veto_reason !== undefined) action.veto_reason = patch.veto_reason;
    if (patch.payload !== undefined) action.payload = patch.payload;
    if (patch.summary !== undefined) action.summary = patch.summary;
    if (["executed", "failed", "vetoed"].includes(to)) {
      action.resolved_at = nowIso();
    }
    return action;
  }

  async updateActionProposal(
    userId: string,
    id: string,
    patch: Partial<Pick<ActionRecord, "payload" | "summary">>
  ): Promise<ActionRecord> {
    const action = await this.getAction(userId, id);
    if (!action) throw new Error("action_not_found");
    if (action.status !== "proposed") throw new Error("not_editable");
    if (patch.payload !== undefined) action.payload = patch.payload;
    if (patch.summary !== undefined) action.summary = patch.summary;
    return action;
  }

  async logEvent(
    userId: string,
    actionId: string,
    type: ActionEventType,
    actor: ActionEventRecord["actor"],
    detail: Record<string, unknown> = {}
  ): Promise<ActionEventRecord> {
    const event: ActionEventRecord = {
      id: randomUUID(),
      action_id: actionId,
      user_id: userId,
      type,
      actor,
      detail,
      created_at: nowIso(),
    };
    this.events.push(event);
    return event;
  }

  async listEvents(userId: string, actionId?: string): Promise<ActionEventRecord[]> {
    return this.events.filter(
      (e) => e.user_id === userId && (!actionId || e.action_id === actionId)
    );
  }

  async getTierSettings(userId: string): Promise<TierSettingRecord[]> {
    return this.tierSettings.filter((t) => t.user_id === userId);
  }

  async setTierSetting(
    userId: string,
    category: TierSettingRecord["category"],
    tier: TierSettingRecord["tier"]
  ): Promise<void> {
    const existing = this.tierSettings.find(
      (t) => t.user_id === userId && t.category === category
    );
    if (existing) existing.tier = tier;
    else this.tierSettings.push({ user_id: userId, category, tier });
  }

  async getUsage(userId: string): Promise<UsageRecord> {
    const start = cycleStart();
    const existing = this.usage.get(userId);
    if (existing && existing.cycle_start === start) return existing;
    const fresh: UsageRecord = {
      user_id: userId,
      cycle_start: start,
      actions_executed: 0,
      limit: BETA_ACTION_LIMIT,
    };
    this.usage.set(userId, fresh);
    return fresh;
  }

  async incrementUsage(userId: string): Promise<UsageRecord> {
    const usage = await this.getUsage(userId);
    usage.actions_executed += 1;
    return usage;
  }

  async createBetaApplication(app: BetaApplication): Promise<void> {
    this.betaApplications.push({ ...app, created_at: nowIso() });
  }

  private subscriptions = new Map<string, SubscriptionRecord>();

  async getSubscription(userId: string): Promise<SubscriptionRecord | null> {
    return this.subscriptions.get(userId) ?? null;
  }

  async upsertSubscription(sub: SubscriptionRecord): Promise<void> {
    this.subscriptions.set(sub.user_id, { ...sub, updated_at: nowIso() });
  }

  async getSubscriptionByCustomer(
    customerId: string
  ): Promise<SubscriptionRecord | null> {
    for (const s of this.subscriptions.values()) {
      if (s.stripe_customer_id === customerId) return s;
    }
    return null;
  }

  private integrations = new Map<string, Map<string, string>>();

  async listIntegrations(userId: string): Promise<string[]> {
    return Array.from(this.integrations.get(userId)?.keys() ?? []);
  }

  async setIntegration(userId: string, key: string, connected: boolean): Promise<void> {
    const map = this.integrations.get(userId) ?? new Map<string, string>();
    if (connected) {
      if (!map.has(key)) map.set(key, nowIso());
    } else map.delete(key);
    this.integrations.set(userId, map);
  }

  async integrationConnectedAt(userId: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.integrations.get(userId) ?? []);
  }

  /* --- connections v2 --- */
  private connections: ConnectionRecord[] = [];
  private mcpTools: McpToolRecord[] = [];
  private automations: AutomationRecord[] = [];
  private automationRuns: AutomationRunRecord[] = [];
  private memories: MemoryRecord[] = [];
  private prefs = new Map<string, UserPrefs>();
  private files: FileRecord[] = [];
  private oauthStates = new Map<string, OAuthStateRow>();

  async createConnection(input: ConnectionInsert): Promise<ConnectionRecord> {
    const now = nowIso();
    const rec: ConnectionRecord = {
      id: randomUUID(),
      user_id: input.user_id,
      provider_key: input.provider_key,
      kind: input.kind,
      display_name: input.display_name,
      status: input.status ?? "connected",
      auth_type: input.auth_type,
      scopes: input.scopes ?? null,
      metadata: input.metadata ?? {},
      encrypted_credentials: input.encrypted_credentials,
      created_at: now,
      updated_at: now,
      last_health_at: null,
    };
    this.connections.push(rec);
    return rec;
  }

  async getConnection(userId: string, id: string): Promise<ConnectionRecord | null> {
    return this.connections.find((c) => c.id === id && c.user_id === userId) ?? null;
  }

  async listConnections(userId: string): Promise<ConnectionRecord[]> {
    return this.connections
      .filter((c) => c.user_id === userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async updateConnection(userId: string, id: string, patch: ConnectionPatch): Promise<void> {
    const c = this.connections.find((x) => x.id === id && x.user_id === userId);
    if (!c) return;
    Object.assign(c, patch, { updated_at: nowIso() });
  }

  async deleteConnection(userId: string, id: string): Promise<void> {
    this.connections = this.connections.filter((c) => !(c.id === id && c.user_id === userId));
    this.mcpTools = this.mcpTools.filter((t) => t.connection_id !== id);
  }

  async saveMcpTools(
    userId: string,
    connectionId: string,
    tools: Omit<McpToolRecord, "connection_id">[]
  ): Promise<void> {
    // Preserve existing enabled/consent state across a re-discovery.
    const prior = new Map(
      this.mcpTools.filter((t) => t.connection_id === connectionId).map((t) => [t.name, t])
    );
    this.mcpTools = this.mcpTools.filter((t) => t.connection_id !== connectionId);
    for (const t of tools) {
      const was = prior.get(t.name);
      this.mcpTools.push({
        ...t,
        connection_id: connectionId,
        enabled: was?.enabled ?? t.enabled,
        consented_at: was?.consented_at ?? t.consented_at,
      });
    }
    void userId;
  }

  async listMcpTools(userId: string, connectionId: string): Promise<McpToolRecord[]> {
    void userId;
    return this.mcpTools.filter((t) => t.connection_id === connectionId);
  }

  async getMcpTool(
    userId: string,
    connectionId: string,
    name: string
  ): Promise<McpToolRecord | null> {
    void userId;
    return this.mcpTools.find((t) => t.connection_id === connectionId && t.name === name) ?? null;
  }

  async setMcpTool(
    userId: string,
    connectionId: string,
    name: string,
    patch: { enabled?: boolean; consented_at?: string | null }
  ): Promise<void> {
    void userId;
    const t = this.mcpTools.find((x) => x.connection_id === connectionId && x.name === name);
    if (t) Object.assign(t, patch);
  }

  async createOAuthState(row: OAuthStateRow): Promise<void> {
    this.oauthStates.set(row.state, row);
  }

  async consumeOAuthState(state: string): Promise<OAuthStateRow | null> {
    const row = this.oauthStates.get(state) ?? null;
    if (row) this.oauthStates.delete(state);
    if (row && Date.parse(row.expires_at) < Date.now()) return null;
    return row;
  }

  private audit: AccountAuditRecord[] = [];

  async logAudit(
    userId: string,
    type: AccountAuditRecord["type"],
    detail: Record<string, unknown> = {}
  ): Promise<void> {
    this.audit.unshift({ id: randomUUID(), user_id: userId, type, detail, created_at: nowIso() });
  }

  async listAudit(userId: string, limit = 20): Promise<AccountAuditRecord[]> {
    return this.audit.filter((a) => a.user_id === userId).slice(0, limit);
  }

  private promos: PromoRecord[] = [];

  async hasPromo(userId: string, offer: PromoOffer): Promise<boolean> {
    return this.promos.some((p) => p.user_id === userId && p.offer === offer);
  }

  async claimPromo(
    userId: string,
    offer: PromoOffer,
    detail: Record<string, unknown> = {}
  ): Promise<boolean> {
    if (await this.hasPromo(userId, offer)) return false;
    this.promos.push({ user_id: userId, offer, detail, created_at: nowIso() });
    return true;
  }

  async listPromos(userId: string): Promise<PromoRecord[]> {
    return this.promos.filter((p) => p.user_id === userId);
  }

  async firstSeenAt(userId: string): Promise<number | null> {
    const times = this.sessions
      .filter((s) => s.user_id === userId)
      .map((s) => Date.parse(s.created_at));
    if (times.length === 0) return null;
    return Math.floor(Math.min(...times) / 1000);
  }


  /* -- automations -- */
  async createAutomation(input: import("./index").AutomationInsert): Promise<AutomationRecord> {
    const now = new Date().toISOString();
    const rec: AutomationRecord = {
      id: randomUUID(),
      user_id: input.user_id,
      name: input.name,
      command: input.command,
      interval_hours: input.interval_hours,
      enabled: true,
      last_run_at: null,
      next_run_at: input.next_run_at,
      created_at: now,
      updated_at: now,
    };
    this.automations.push(rec);
    return { ...rec };
  }

  async listAutomations(userId: string): Promise<AutomationRecord[]> {
    return this.automations.filter((a) => a.user_id === userId).map((a) => ({ ...a }));
  }

  async getAutomation(userId: string, id: string): Promise<AutomationRecord | null> {
    const a = this.automations.find((x) => x.id === id && x.user_id === userId);
    return a ? { ...a } : null;
  }

  async updateAutomation(
    userId: string,
    id: string,
    patch: Partial<Pick<AutomationRecord, "name" | "command" | "interval_hours" | "enabled" | "last_run_at" | "next_run_at">>
  ): Promise<AutomationRecord | null> {
    const a = this.automations.find((x) => x.id === id && x.user_id === userId);
    if (!a) return null;
    Object.assign(a, patch, { updated_at: new Date().toISOString() });
    return { ...a };
  }

  async deleteAutomation(userId: string, id: string): Promise<void> {
    this.automations = this.automations.filter((x) => !(x.id === id && x.user_id === userId));
    this.automationRuns = this.automationRuns.filter((r) => r.automation_id !== id || r.user_id !== userId);
  }

  async listDueAutomations(limit: number): Promise<AutomationRecord[]> {
    const now = Date.now();
    return this.automations
      .filter((a) => a.enabled && Date.parse(a.next_run_at) <= now)
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }

  async createAutomationRun(
    input: Omit<AutomationRunRecord, "id" | "created_at">
  ): Promise<AutomationRunRecord> {
    const rec: AutomationRunRecord = {
      ...input,
      id: randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.automationRuns.push(rec);
    return { ...rec };
  }

  async listAutomationRuns(
    userId: string,
    automationId: string,
    limit = 20
  ): Promise<AutomationRunRecord[]> {
    return this.automationRuns
      .filter((r) => r.user_id === userId && r.automation_id === automationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }


  /* -- memory -- */
  async createMemory(userId: string, content: string): Promise<MemoryRecord> {
    const now = new Date().toISOString();
    const rec: MemoryRecord = {
      id: randomUUID(),
      user_id: userId,
      content,
      enabled: true,
      created_at: now,
      updated_at: now,
    };
    this.memories.push(rec);
    return { ...rec };
  }

  async listMemories(userId: string): Promise<MemoryRecord[]> {
    return this.memories.filter((m) => m.user_id === userId).map((m) => ({ ...m }));
  }

  async updateMemory(
    userId: string,
    id: string,
    patch: Partial<Pick<MemoryRecord, "content" | "enabled">>
  ): Promise<MemoryRecord | null> {
    const m = this.memories.find((x) => x.id === id && x.user_id === userId);
    if (!m) return null;
    Object.assign(m, patch, { updated_at: new Date().toISOString() });
    return { ...m };
  }

  async deleteMemory(userId: string, id: string): Promise<void> {
    this.memories = this.memories.filter((x) => !(x.id === id && x.user_id === userId));
  }

  async getPrefs(userId: string): Promise<UserPrefs> {
    return this.prefs.get(userId) ?? { user_id: userId, memory_enabled: true };
  }

  async setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
    this.prefs.set(userId, { user_id: userId, memory_enabled: enabled });
  }


  /* -- files -- */
  async createFile(input: import("./index").FileInsert): Promise<FileRecord> {
    const now = new Date().toISOString();
    const rec: FileRecord = {
      id: randomUUID(),
      user_id: input.user_id,
      session_id: input.session_id ?? null,
      name: input.name,
      mime: input.mime,
      content: input.content,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    this.files.push(rec);
    return { ...rec };
  }

  async listFiles(userId: string): Promise<FileRecord[]> {
    return this.files
      .filter((f) => f.user_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((f) => ({ ...f, content: f.content }));
  }

  async getFile(userId: string, id: string): Promise<FileRecord | null> {
    const f = this.files.find((x) => x.id === id && x.user_id === userId);
    return f ? { ...f } : null;
  }

  async updateFile(
    userId: string,
    id: string,
    patch: Partial<Pick<FileRecord, "name" | "content">>
  ): Promise<FileRecord | null> {
    const f = this.files.find((x) => x.id === id && x.user_id === userId);
    if (!f) return null;
    Object.assign(f, patch, { version: f.version + 1, updated_at: new Date().toISOString() });
    return { ...f };
  }

  async deleteFile(userId: string, id: string): Promise<void> {
    this.files = this.files.filter((x) => !(x.id === id && x.user_id === userId));
  }

  /* -- durable missions -- */
  private missions: MissionRecord[] = [];
  private missionSteps: MissionStepRecord[] = [];

  async createMission(input: import("./index").MissionInsert): Promise<MissionRecord> {
    const now = nowIso();
    const rec: MissionRecord = {
      id: randomUUID(),
      user_id: input.user_id,
      session_id: input.session_id,
      goal: input.goal,
      state: "queued",
      plan_version: 1,
      pending_question: null,
      receipt: null,
      error: null,
      lease_owner: null,
      lease_expires_at: null,
      tool_calls: 0,
      browser_actions: 0,
      budget_cents: 200,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    this.missions.push(rec);
    return { ...rec };
  }

  async claimMissionLease(missionId: string, owner: string, ttlMs: number): Promise<MissionRecord | null> {
    const m = this.missions.find((x) => x.id === missionId);
    if (!m) return null;
    const now = Date.now();
    const held = m.lease_owner && m.lease_expires_at && new Date(m.lease_expires_at).getTime() > now;
    if (held && m.lease_owner !== owner) return null; // someone else holds it
    m.lease_owner = owner;
    m.lease_expires_at = new Date(now + ttlMs).toISOString();
    m.updated_at = nowIso();
    return { ...m };
  }

  async releaseMissionLease(missionId: string, owner: string): Promise<void> {
    const m = this.missions.find((x) => x.id === missionId);
    if (m && m.lease_owner === owner) {
      m.lease_owner = null;
      m.lease_expires_at = null;
    }
  }

  async getMission(userId: string, id: string): Promise<MissionRecord | null> {
    const m = this.missions.find((x) => x.id === id && x.user_id === userId);
    return m ? { ...m } : null;
  }

  async listMissions(userId: string, limit = 50): Promise<MissionRecord[]> {
    return this.missions
      .filter((m) => m.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }

  async updateMission(
    userId: string,
    id: string,
    patch: Partial<
      Pick<MissionRecord, "state" | "plan_version" | "pending_question" | "receipt" | "error" | "completed_at" | "lease_owner" | "lease_expires_at" | "tool_calls" | "browser_actions" | "budget_cents">
    >
  ): Promise<MissionRecord | null> {
    const m = this.missions.find((x) => x.id === id && x.user_id === userId);
    if (!m) return null;
    Object.assign(m, patch, { updated_at: nowIso() });
    return { ...m };
  }

  async listRunnableMissions(limit: number): Promise<MissionRecord[]> {
    const runnable = new Set(["queued", "running", "retrying", "verifying"]);
    return this.missions
      .filter((m) => runnable.has(m.state))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }

  async createMissionSteps(
    steps: import("./index").MissionStepInsert[]
  ): Promise<MissionStepRecord[]> {
    const now = nowIso();
    const created = steps.map((s) => ({
      id: randomUUID(),
      mission_id: s.mission_id,
      user_id: s.user_id,
      idx: s.idx,
      purpose: s.purpose,
      operator: s.operator,
      tool: s.tool,
      state: s.state ?? ("ready" as const),
      depends_on: [...s.depends_on],
      input: { ...(s.input ?? {}) },
      output: null,
      sources: [...(s.sources ?? [])],
      action_id: null,
      retry_count: 0,
      max_retries: s.max_retries ?? 2,
      error: null,
      verification: null,
      started_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    }));
    this.missionSteps.push(...created);
    return created.map((s) => ({ ...s }));
  }

  async listMissionSteps(userId: string, missionId: string): Promise<MissionStepRecord[]> {
    return this.missionSteps
      .filter((s) => s.mission_id === missionId && s.user_id === userId)
      .sort((a, b) => a.idx - b.idx)
      .map((s) => ({ ...s }));
  }

  async updateMissionStep(
    userId: string,
    id: string,
    patch: Partial<
      Pick<
        MissionStepRecord,
        | "state" | "input" | "output" | "sources" | "action_id"
        | "retry_count" | "error" | "verification" | "started_at" | "completed_at"
      >
    >
  ): Promise<MissionStepRecord | null> {
    const s = this.missionSteps.find((x) => x.id === id && x.user_id === userId);
    if (!s) return null;
    Object.assign(s, patch, { updated_at: nowIso() });
    return { ...s };
  }

  /* -- mission sources -- */
  private missionSources: MissionSourceRecord[] = [];

  async createMissionSource(input: import("./index").MissionSourceInsert): Promise<MissionSourceRecord> {
    const now = nowIso();
    const rec: MissionSourceRecord = {
      id: randomUUID(),
      user_id: input.user_id,
      mission_id: null,
      kind: input.kind,
      name: input.name,
      subtype: input.subtype ?? "",
      size_bytes: input.size_bytes ?? 0,
      status: input.status,
      summary: input.summary ?? "",
      injection_flag: input.injection_flag ?? false,
      detail: { ...(input.detail ?? {}) },
      created_at: now,
      updated_at: now,
    };
    this.missionSources.push(rec);
    return { ...rec };
  }

  async getMissionSource(userId: string, id: string): Promise<MissionSourceRecord | null> {
    const s = this.missionSources.find((x) => x.id === id && x.user_id === userId);
    return s ? { ...s } : null;
  }

  async listStagedSources(userId: string): Promise<MissionSourceRecord[]> {
    return this.missionSources
      .filter((s) => s.user_id === userId && s.mission_id === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((s) => ({ ...s }));
  }

  async listMissionSources(userId: string, missionId: string): Promise<MissionSourceRecord[]> {
    return this.missionSources
      .filter((s) => s.user_id === userId && s.mission_id === missionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((s) => ({ ...s }));
  }

  async deleteMissionSource(userId: string, id: string): Promise<void> {
    this.missionSources = this.missionSources.filter((s) => !(s.id === id && s.user_id === userId));
  }

  async attachSourcesToMission(userId: string, sourceIds: string[], missionId: string): Promise<number> {
    const ids = new Set(sourceIds);
    let n = 0;
    for (const s of this.missionSources) {
      // Only STAGED sources owned by the user can be attached (never steal
      // another mission's or user's source).
      if (ids.has(s.id) && s.user_id === userId && s.mission_id === null) {
        s.mission_id = missionId;
        s.updated_at = nowIso();
        n++;
      }
    }
    return n;
  }

  /* -- browser operator -- */
  private browserSessions: BrowserSessionRecord[] = [];
  private browserActions: BrowserActionRecord[] = [];

  async createBrowserSession(input: import("./index").BrowserSessionInsert): Promise<BrowserSessionRecord> {
    const now = nowIso();
    const rec: BrowserSessionRecord = {
      id: randomUUID(),
      user_id: input.user_id,
      mission_id: input.mission_id,
      operator: input.operator,
      provider: input.provider,
      simulated: input.simulated,
      status: "active",
      objective: input.objective,
      current_url: null,
      page_title: null,
      provider_ref: input.provider_ref ?? null,
      last_action: null,
      stop_reason: null,
      expires_at: input.expires_at ?? null,
      created_at: now,
      updated_at: now,
    };
    this.browserSessions.push(rec);
    return { ...rec };
  }

  async getBrowserSession(userId: string, id: string): Promise<BrowserSessionRecord | null> {
    const s = this.browserSessions.find((x) => x.id === id && x.user_id === userId);
    return s ? { ...s } : null;
  }

  async listBrowserSessions(userId: string, missionId: string): Promise<BrowserSessionRecord[]> {
    return this.browserSessions
      .filter((s) => s.user_id === userId && s.mission_id === missionId)
      .map((s) => ({ ...s }));
  }

  async updateBrowserSession(
    userId: string,
    id: string,
    patch: Partial<Pick<BrowserSessionRecord, "status" | "current_url" | "page_title" | "provider_ref" | "last_action" | "stop_reason" | "expires_at">>
  ): Promise<BrowserSessionRecord | null> {
    const s = this.browserSessions.find((x) => x.id === id && x.user_id === userId);
    if (!s) return null;
    Object.assign(s, patch, { updated_at: nowIso() });
    return { ...s };
  }

  async createBrowserAction(input: import("./index").BrowserActionInsert): Promise<BrowserActionRecord> {
    const now = nowIso();
    const rec: BrowserActionRecord = {
      id: randomUUID(),
      session_id: input.session_id,
      mission_id: input.mission_id,
      user_id: input.user_id,
      idx: input.idx,
      purpose: input.purpose,
      kind: input.kind,
      target: input.target ?? null,
      risk: input.risk,
      changes_external: input.changes_external,
      requires_approval: input.requires_approval,
      action_id: null,
      state: input.state ?? "proposed",
      detail: { ...(input.detail ?? {}) },
      verification: null,
      created_at: now,
      updated_at: now,
    };
    this.browserActions.push(rec);
    return { ...rec };
  }

  async listBrowserActions(userId: string, sessionId: string): Promise<BrowserActionRecord[]> {
    return this.browserActions
      .filter((a) => a.user_id === userId && a.session_id === sessionId)
      .sort((a, b) => a.idx - b.idx)
      .map((a) => ({ ...a }));
  }

  async updateBrowserAction(
    userId: string,
    id: string,
    patch: Partial<Pick<BrowserActionRecord, "state" | "action_id" | "detail" | "verification">>
  ): Promise<BrowserActionRecord | null> {
    const a = this.browserActions.find((x) => x.id === id && x.user_id === userId);
    if (!a) return null;
    Object.assign(a, patch, { updated_at: nowIso() });
    return { ...a };
  }

  /* -- workspaces -- */
  private workspaces: WorkspaceRecord[] = [];
  private workspaceMembers: WorkspaceMemberRecord[] = [];

  async createWorkspace(userId: string, email: string, name: string): Promise<WorkspaceRecord> {
    const now = new Date().toISOString();
    const ws: WorkspaceRecord = { id: randomUUID(), owner_user_id: userId, name, created_at: now };
    this.workspaces.push(ws);
    this.workspaceMembers.push({
      id: randomUUID(),
      workspace_id: ws.id,
      user_id: userId,
      email: email.toLowerCase(),
      role: "owner",
      status: "active",
      created_at: now,
      updated_at: now,
    });
    return { ...ws };
  }

  async getWorkspaceForUser(userId: string): Promise<WorkspaceRecord | null> {
    const m = this.workspaceMembers.find(
      (x) => x.user_id === userId && x.status === "active"
    );
    if (!m) return null;
    const ws = this.workspaces.find((w) => w.id === m.workspace_id);
    return ws ? { ...ws } : null;
  }

  async getWorkspace(id: string): Promise<WorkspaceRecord | null> {
    const ws = this.workspaces.find((w) => w.id === id);
    return ws ? { ...ws } : null;
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    return this.workspaceMembers
      .filter((m) => m.workspace_id === workspaceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({ ...m }));
  }

  async inviteWorkspaceMember(
    workspaceId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">
  ): Promise<WorkspaceMemberRecord> {
    const lower = email.toLowerCase();
    if (this.workspaceMembers.some((m) => m.workspace_id === workspaceId && m.email === lower)) {
      throw new Error("already_invited");
    }
    const now = new Date().toISOString();
    const rec: WorkspaceMemberRecord = {
      id: randomUUID(),
      workspace_id: workspaceId,
      user_id: null,
      email: lower,
      role,
      status: "invited",
      created_at: now,
      updated_at: now,
    };
    this.workspaceMembers.push(rec);
    return { ...rec };
  }

  async acceptWorkspaceInvites(userId: string, email: string): Promise<WorkspaceMemberRecord | null> {
    // Already in a workspace → nothing to accept (v1: one workspace per user).
    if (this.workspaceMembers.some((m) => m.user_id === userId && m.status === "active")) return null;
    const lower = email.toLowerCase();
    const invite = this.workspaceMembers
      .filter((m) => m.email === lower && m.status === "invited")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (!invite) return null;
    invite.user_id = userId;
    invite.status = "active";
    invite.updated_at = new Date().toISOString();
    return { ...invite };
  }

  async updateWorkspaceMember(
    workspaceId: string,
    memberId: string,
    patch: Partial<Pick<WorkspaceMemberRecord, "role">>
  ): Promise<WorkspaceMemberRecord | null> {
    const m = this.workspaceMembers.find(
      (x) => x.id === memberId && x.workspace_id === workspaceId
    );
    if (!m) return null;
    Object.assign(m, patch, { updated_at: new Date().toISOString() });
    return { ...m };
  }

  async removeWorkspaceMember(workspaceId: string, memberId: string): Promise<void> {
    this.workspaceMembers = this.workspaceMembers.filter(
      (m) => !(m.id === memberId && m.workspace_id === workspaceId)
    );
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.workspaces = this.workspaces.filter((w) => w.id !== id);
    this.workspaceMembers = this.workspaceMembers.filter((m) => m.workspace_id !== id);
  }

  async listProposedActionsForUsers(userIds: string[], limit = 50): Promise<ActionRecord[]> {
    const ids = new Set(userIds);
    return this.actions
      .filter((a) => ids.has(a.user_id) && a.status === "proposed")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }

  async deleteAllUserData(userId: string): Promise<void> {
    this.sessions = this.sessions.filter((s) => s.user_id !== userId);
    this.messages = this.messages.filter((m) => m.user_id !== userId);
    this.actions = this.actions.filter((a) => a.user_id !== userId);
    this.events = this.events.filter((e) => e.user_id !== userId);
    this.tierSettings = this.tierSettings.filter((t) => t.user_id !== userId);
    this.usage.delete(userId);
    this.integrations.delete(userId);
    this.subscriptions.delete(userId);
    this.audit = this.audit.filter((a) => a.user_id !== userId);
    this.promos = this.promos.filter((p) => p.user_id !== userId);
    const gone = new Set(
      this.connections.filter((c) => c.user_id === userId).map((c) => c.id)
    );
    this.connections = this.connections.filter((c) => c.user_id !== userId);
    this.mcpTools = this.mcpTools.filter((t) => !gone.has(t.connection_id));
    this.automations = this.automations.filter((a) => a.user_id !== userId);
    this.automationRuns = this.automationRuns.filter((r) => r.user_id !== userId);
    this.memories = this.memories.filter((m) => m.user_id !== userId);
    this.prefs.delete(userId);
    this.files = this.files.filter((f) => f.user_id !== userId);
    this.missions = this.missions.filter((m) => m.user_id !== userId);
    this.missionSteps = this.missionSteps.filter((s) => s.user_id !== userId);
    this.browserSessions = this.browserSessions.filter((s) => s.user_id !== userId);
    this.browserActions = this.browserActions.filter((a) => a.user_id !== userId);
    this.missionSources = this.missionSources.filter((s) => s.user_id !== userId);
    // Workspaces they OWN dissolve entirely; memberships elsewhere are removed.
    const owned = new Set(
      this.workspaces.filter((w) => w.owner_user_id === userId).map((w) => w.id)
    );
    this.workspaces = this.workspaces.filter((w) => !owned.has(w.id));
    this.workspaceMembers = this.workspaceMembers.filter(
      (m) => !owned.has(m.workspace_id) && m.user_id !== userId
    );
  }
}
