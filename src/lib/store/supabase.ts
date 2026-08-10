import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { clampBudget, DEFAULT_ACTION_BUDGET } from "../missions/budget";
import {
  ActionEventRecord,
  ActionEventType,
  ActionRecord,
  ActionStatus,
  BETA_ACTION_LIMIT,
  BetaApplication,
  canTransition,
  AccountAuditRecord,
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
  PermissionRuleRecord,
  UserPrefs,
  FileRecord,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  WorkspaceRole,
  MissionRecord,
  MissionStepRecord,
  BrowserSessionRecord,
  BrowserActionRecord,
  BrowserProductRecord,
  MissionSourceRecord,
  SignalStateRecord,
  SignalStateStatus,
  SignatureRecord,
  TemporaryAuthorityRecord,
  HoldRecord,
  ObjectiveLinkRecord,
  ObjectiveRecord,
  RUNNABLE_MISSION_STATES,
} from "../types";
import type {
  ActionCountFilter,
  ActionHead,
  ActionInsert,
  ActionStatusRow,
  ActivityFilter,
  ConnectionInsert,
  ConnectionPatch,
  McpToolPatch,
  OAuthStateRow,
  Store,
} from "./index";
import type { ConnectionRecord, McpToolRecord } from "../integrations/types";

function cycleStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/**
 * Production backend. Uses the service-role key from server routes only —
 * the anon/browser client never writes to these tables. Status transitions
 * go through the transition_action Postgres function, which revalidates the
 * state machine inside the database (defense in depth: RLS already blocks
 * clients from touching status at all).
 */
export class SupabaseStore implements Store {
  private client: SupabaseClient;

  constructor() {
    // .trim() defends against a stray space/newline pasted into the dashboard
    // env vars, which Supabase would otherwise reject with "Invalid API key".
    this.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      { auth: { persistSession: false } }
    );
  }

  private async one<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (data === null) throw new Error("not_found");
    return data;
  }

  async createSession(userId: string, title: string): Promise<SessionRecord> {
    return this.one(
      this.client
        .from("sessions")
        .insert({ user_id: userId, title })
        .select()
        .single()
    );
  }

  async getSession(userId: string, id: string): Promise<SessionRecord | null> {
    const { data } = await this.client
      .from("sessions")
      .select()
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    const { data, error } = await this.client
      .from("sessions")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async addMessage(
    userId: string,
    sessionId: string,
    role: "user" | "agent",
    content: string
  ): Promise<MessageRecord> {
    return this.one(
      this.client
        .from("messages")
        .insert({ user_id: userId, session_id: sessionId, role, content })
        .select()
        .single()
    );
  }

  async listMessages(userId: string, sessionId: string): Promise<MessageRecord[]> {
    const { data, error } = await this.client
      .from("messages")
      .select()
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async createAction(input: ActionInsert): Promise<ActionRecord> {
    return this.one(
      this.client
        .from("actions")
        .insert({ ...input, status: "proposed" })
        .select()
        .single()
    );
  }

  async getAction(userId: string, id: string): Promise<ActionRecord | null> {
    const { data } = await this.client
      .from("actions")
      .select()
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  }

  async listActions(
    userId: string,
    filter: ActivityFilter = {}
  ): Promise<ActionRecord[]> {
    let query = this.client
      .from("actions")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 500);
    if (filter.session_id) query = query.eq("session_id", filter.session_id);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.tier) query = query.eq("tier", filter.tier);
    if (filter.category) query = query.eq("category", filter.category);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listActionHeads(userId: string, limit: number): Promise<ActionHead[]> {
    // Projection only — payload/result JSON never leaves the database.
    const { data, error } = await this.client
      .from("actions")
      .select("id, session_id, status, category, tier, summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActionHead[];
  }

  async listActionStatusesForSessions(
    userId: string,
    sessionIds: string[]
  ): Promise<ActionStatusRow[]> {
    if (sessionIds.length === 0) return [];
    const out: ActionStatusRow[] = [];
    // Chunk the .in() list so the PostgREST URL stays comfortably bounded.
    for (let i = 0; i < sessionIds.length; i += 100) {
      const { data, error } = await this.client
        .from("actions")
        .select("id, session_id, status")
        .eq("user_id", userId)
        .in("session_id", sessionIds.slice(i, i + 100));
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as ActionStatusRow[]));
    }
    return out;
  }

  async countActions(userId: string, filter: ActionCountFilter = {}): Promise<number> {
    let query = this.client
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.injection_flag !== undefined)
      query = query.eq("injection_flag", filter.injection_flag);
    if (filter.since) query = query.gte("created_at", filter.since);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async countSessions(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async transitionAction(
    userId: string,
    id: string,
    to: ActionStatus,
    patch: Partial<
      Pick<ActionRecord, "result" | "veto_reason" | "payload" | "summary">
    > = {}
  ): Promise<ActionRecord> {
    const current = await this.getAction(userId, id);
    if (!current) throw new Error("action_not_found");
    if (!canTransition(current.status, to)) {
      throw new Error(`invalid_transition:${current.status}->${to}`);
    }
    if ((to === "executing" || to === "approved") && current.injection_flag) {
      throw new Error("injection_blocked");
    }
    // The Postgres function revalidates the transition atomically (and the
    // trigger + function re-check the injection flag inside the database).
    const { data, error } = await this.client.rpc("transition_action", {
      p_action_id: id,
      p_user_id: userId,
      p_new_status: to,
      p_result: patch.result ?? null,
      p_veto_reason: patch.veto_reason ?? null,
      p_payload: patch.payload ?? null,
      p_summary: patch.summary ?? null,
    });
    if (error) throw new Error(error.message);
    return data as ActionRecord;
  }

  async updateActionProposal(
    userId: string,
    id: string,
    patch: Partial<Pick<ActionRecord, "payload" | "summary">>
  ): Promise<ActionRecord> {
    const current = await this.getAction(userId, id);
    if (!current) throw new Error("action_not_found");
    if (current.status !== "proposed") throw new Error("not_editable");
    return this.one(
      this.client
        .from("actions")
        .update(patch)
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "proposed")
        .select()
        .single()
    );
  }

  async logEvent(
    userId: string,
    actionId: string,
    type: ActionEventType,
    actor: ActionEventRecord["actor"],
    detail: Record<string, unknown> = {}
  ): Promise<ActionEventRecord> {
    return this.one(
      this.client
        .from("action_events")
        .insert({ user_id: userId, action_id: actionId, type, actor, detail })
        .select()
        .single()
    );
  }

  async listEvents(
    userId: string,
    actionId?: string,
    limit?: number
  ): Promise<ActionEventRecord[]> {
    let query = this.client.from("action_events").select().eq("user_id", userId);
    if (actionId) query = query.eq("action_id", actionId);
    if (limit) {
      // Newest N, bounded in the query — then restored to ascending order.
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).reverse();
    }
    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listEventsForActions(
    userId: string,
    actionIds: string[]
  ): Promise<ActionEventRecord[]> {
    if (actionIds.length === 0) return [];
    const out: ActionEventRecord[] = [];
    for (let i = 0; i < actionIds.length; i += 100) {
      const { data, error } = await this.client
        .from("action_events")
        .select()
        .eq("user_id", userId)
        .in("action_id", actionIds.slice(i, i + 100));
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
    }
    return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getTierSettings(userId: string): Promise<TierSettingRecord[]> {
    const { data, error } = await this.client
      .from("tier_settings")
      .select()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async setTierSetting(
    userId: string,
    category: TierSettingRecord["category"],
    tier: TierSettingRecord["tier"]
  ): Promise<void> {
    const { error } = await this.client
      .from("tier_settings")
      .upsert({ user_id: userId, category, tier }, { onConflict: "user_id,category" });
    if (error) throw new Error(error.message);
  }

  async getUsage(userId: string): Promise<UsageRecord> {
    const start = cycleStart();
    const { data } = await this.client
      .from("usage")
      .select()
      .eq("user_id", userId)
      .eq("cycle_start", start)
      .maybeSingle();
    if (data) return data;
    const fresh = {
      user_id: userId,
      cycle_start: start,
      actions_executed: 0,
      limit: BETA_ACTION_LIMIT,
    };
    const { error } = await this.client.from("usage").upsert(fresh, {
      onConflict: "user_id,cycle_start",
    });
    if (error) throw new Error(error.message);
    return fresh;
  }

  async incrementUsage(userId: string, cycleStart?: string): Promise<UsageRecord> {
    // A caller that already resolved usage this request passes cycle_start so
    // we don't re-fetch (getUsage also guarantees the row exists first).
    const start = cycleStart ?? (await this.getUsage(userId)).cycle_start;
    const { data, error } = await this.client.rpc("increment_usage", {
      p_user_id: userId,
      p_cycle_start: start,
    });
    if (error) throw new Error(error.message);
    return data as UsageRecord;
  }

  async createBetaApplication(app: BetaApplication): Promise<void> {
    const { error } = await this.client.from("beta_applications").insert(app);
    if (error) throw new Error(error.message);
  }

  async getSubscription(userId: string): Promise<SubscriptionRecord | null> {
    const { data } = await this.client
      .from("subscriptions")
      .select()
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  }

  async upsertSubscription(sub: SubscriptionRecord): Promise<void> {
    const { error } = await this.client
      .from("subscriptions")
      .upsert({ ...sub, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
  }

  async getSubscriptionByCustomer(
    customerId: string
  ): Promise<SubscriptionRecord | null> {
    const { data } = await this.client
      .from("subscriptions")
      .select()
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return data ?? null;
  }

  async listIntegrations(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("integrations")
      .select("key")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.key as string);
  }

  async setIntegration(userId: string, key: string, connected: boolean): Promise<void> {
    if (connected) {
      const { error } = await this.client
        .from("integrations")
        .upsert({ user_id: userId, key }, { onConflict: "user_id,key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await this.client
        .from("integrations")
        .delete()
        .eq("user_id", userId)
        .eq("key", key);
      if (error) throw new Error(error.message);
    }
  }

  async integrationConnectedAt(userId: string): Promise<Record<string, string>> {
    const { data, error } = await this.client
      .from("integrations")
      .select("key, connected_at")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.connected_at as string]));
  }

  /* --- connections v2 --- */
  private rowToConnection(r: Record<string, unknown>): ConnectionRecord {
    return {
      id: r.id as string,
      user_id: r.user_id as string,
      provider_key: r.provider_key as string,
      kind: r.kind as ConnectionRecord["kind"],
      display_name: r.display_name as string,
      status: r.status as ConnectionRecord["status"],
      auth_type: r.auth_type as ConnectionRecord["auth_type"],
      encrypted_credentials: (r.encrypted_credentials as string | null) ?? null,
      scopes: (r.scopes as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      last_health_at: (r.last_health_at as string | null) ?? null,
    };
  }

  async createConnection(input: ConnectionInsert): Promise<ConnectionRecord> {
    const row = await this.one<Record<string, unknown>>(
      this.client
        .from("connections")
        .insert({
          user_id: input.user_id,
          provider_key: input.provider_key,
          kind: input.kind,
          display_name: input.display_name,
          auth_type: input.auth_type,
          encrypted_credentials: input.encrypted_credentials,
          scopes: input.scopes ?? null,
          metadata: input.metadata ?? {},
          status: input.status ?? "connected",
        })
        .select()
        .single()
    );
    return this.rowToConnection(row);
  }

  async getConnection(userId: string, id: string): Promise<ConnectionRecord | null> {
    const { data, error } = await this.client
      .from("connections")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.rowToConnection(data) : null;
  }

  async listConnections(userId: string): Promise<ConnectionRecord[]> {
    const { data, error } = await this.client
      .from("connections")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.rowToConnection(r));
  }

  async updateConnection(userId: string, id: string, patch: ConnectionPatch): Promise<void> {
    const { error } = await this.client
      .from("connections")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteConnection(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("connections")
      .delete()
      .eq("user_id", userId)
      .eq("id", id); // mcp_tools cascade via FK ON DELETE CASCADE
    if (error) throw new Error(error.message);
  }

  async saveMcpTools(
    userId: string,
    connectionId: string,
    tools: Omit<McpToolRecord, "connection_id">[]
  ): Promise<void> {
    // Preserve enabled/consent across a re-discovery.
    const existing = await this.listMcpTools(userId, connectionId);
    const prior = new Map(existing.map((t) => [t.name, t]));
    await this.client.from("mcp_tools").delete().eq("connection_id", connectionId);
    if (tools.length === 0) return;
    const rows = tools.map((t) => {
      const was = prior.get(t.name);
      // A category a HUMAN settled outlives re-discovery. Re-running the
      // classifier over it would quietly undo their decision — and the whole
      // point of asking was that the machine wasn't sure.
      const userOwned = was?.classified_by === "user";
      return {
        connection_id: connectionId,
        user_id: userId,
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
        sensitive: userOwned ? was.sensitive : t.sensitive,
        enabled: was?.enabled ?? t.enabled,
        consented_at: was?.consented_at ?? t.consented_at,
        category: userOwned ? was.category : t.category,
        confidence: userOwned ? was.confidence : t.confidence,
        classified_by: userOwned ? "user" : t.classified_by,
      };
    });
    const { error } = await this.client.from("mcp_tools").insert(rows);
    if (error) throw new Error(error.message);
  }

  private rowToTool(r: Record<string, unknown>): McpToolRecord {
    return {
      connection_id: r.connection_id as string,
      name: r.name as string,
      description: (r.description as string) ?? "",
      input_schema: (r.input_schema as Record<string, unknown>) ?? {},
      enabled: Boolean(r.enabled),
      sensitive: Boolean(r.sensitive),
      consented_at: (r.consented_at as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      confidence: typeof r.confidence === "number" ? r.confidence : null,
      classified_by: (r.classified_by as "auto" | "user" | null) ?? null,
    };
  }

  async listMcpTools(userId: string, connectionId: string): Promise<McpToolRecord[]> {
    const { data, error } = await this.client
      .from("mcp_tools")
      .select("*")
      .eq("user_id", userId)
      .eq("connection_id", connectionId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.rowToTool(r));
  }

  async getMcpTool(
    userId: string,
    connectionId: string,
    name: string
  ): Promise<McpToolRecord | null> {
    const { data, error } = await this.client
      .from("mcp_tools")
      .select("*")
      .eq("user_id", userId)
      .eq("connection_id", connectionId)
      .eq("name", name)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.rowToTool(data) : null;
  }

  async setMcpTool(
    userId: string,
    connectionId: string,
    name: string,
    patch: McpToolPatch
  ): Promise<void> {
    const { error } = await this.client
      .from("mcp_tools")
      .update(patch)
      .eq("user_id", userId)
      .eq("connection_id", connectionId)
      .eq("name", name);
    if (error) throw new Error(error.message);
  }

  async createOAuthState(row: OAuthStateRow): Promise<void> {
    const { error } = await this.client.from("oauth_states").insert({
      state: row.state,
      user_id: row.user_id,
      provider_key: row.provider_key,
      code_verifier: row.code_verifier ?? null,
      redirect_uri: row.redirect_uri,
      expires_at: row.expires_at,
    });
    if (error) throw new Error(error.message);
  }

  async consumeOAuthState(state: string): Promise<OAuthStateRow | null> {
    const { data, error } = await this.client
      .from("oauth_states")
      .delete()
      .eq("state", state)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (Date.parse(data.expires_at as string) < Date.now()) return null;
    return {
      state: data.state as string,
      user_id: data.user_id as string,
      provider_key: data.provider_key as string,
      code_verifier: (data.code_verifier as string | null) ?? null,
      redirect_uri: data.redirect_uri as string,
      expires_at: data.expires_at as string,
    };
  }

  async logAudit(
    userId: string,
    type: AccountAuditRecord["type"],
    detail: Record<string, unknown> = {}
  ): Promise<void> {
    const { error } = await this.client
      .from("account_audit")
      .insert({ user_id: userId, type, detail });
    if (error) throw new Error(error.message);
  }

  async listAudit(userId: string, limit = 20): Promise<AccountAuditRecord[]> {
    const { data, error } = await this.client
      .from("account_audit")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async hasPromo(userId: string, offer: PromoOffer): Promise<boolean> {
    const { data } = await this.client
      .from("promotions")
      .select("offer")
      .eq("user_id", userId)
      .eq("offer", offer)
      .maybeSingle();
    return Boolean(data);
  }

  async claimPromo(
    userId: string,
    offer: PromoOffer,
    detail: Record<string, unknown> = {}
  ): Promise<boolean> {
    // The (user_id, offer) unique constraint makes this the atomic single-use
    // gate: a duplicate insert fails and we report "already claimed".
    const { error } = await this.client
      .from("promotions")
      .insert({ user_id: userId, offer, detail });
    if (error) {
      if (error.code === "23505") return false; // unique_violation
      throw new Error(error.message);
    }
    return true;
  }

  async listPromos(userId: string): Promise<PromoRecord[]> {
    const { data, error } = await this.client
      .from("promotions")
      .select()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async firstSeenAt(userId: string): Promise<number | null> {
    const { data } = await this.client
      .from("sessions")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.created_at ? Math.floor(Date.parse(data.created_at) / 1000) : null;
  }


  /* -- automations -- */
  async createAutomation(input: import("./index").AutomationInsert): Promise<AutomationRecord> {
    const { data, error } = await this.client
      .from("automations")
      .insert({
        user_id: input.user_id,
        name: input.name,
        command: input.command,
        interval_hours: input.interval_hours,
        mode: input.mode,
        next_run_at: input.next_run_at,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as AutomationRecord;
  }

  async listAutomations(userId: string): Promise<AutomationRecord[]> {
    const { data, error } = await this.client
      .from("automations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AutomationRecord[];
  }

  async getAutomation(userId: string, id: string): Promise<AutomationRecord | null> {
    const { data, error } = await this.client
      .from("automations")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AutomationRecord) ?? null;
  }

  async updateAutomation(
    userId: string,
    id: string,
    patch: Partial<Pick<AutomationRecord, "name" | "command" | "interval_hours" | "mode" | "enabled" | "last_run_at" | "next_run_at">>
  ): Promise<AutomationRecord | null> {
    const { data, error } = await this.client
      .from("automations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AutomationRecord) ?? null;
  }

  async deleteAutomation(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("automations")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listDueAutomations(limit: number): Promise<AutomationRecord[]> {
    const { data, error } = await this.client
      .from("automations")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as AutomationRecord[];
  }

  async createAutomationRun(
    input: Omit<AutomationRunRecord, "id" | "created_at">
  ): Promise<AutomationRunRecord> {
    const { data, error } = await this.client
      .from("automation_runs")
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as AutomationRunRecord;
  }

  async listAutomationRuns(
    userId: string,
    automationId: string,
    limit = 20
  ): Promise<AutomationRunRecord[]> {
    const { data, error } = await this.client
      .from("automation_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as AutomationRunRecord[];
  }


  /* -- memory -- */
  async createMemory(userId: string, content: string): Promise<MemoryRecord> {
    const { data, error } = await this.client
      .from("memories")
      .insert({ user_id: userId, content })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MemoryRecord;
  }

  async listMemories(userId: string): Promise<MemoryRecord[]> {
    const { data, error } = await this.client
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MemoryRecord[];
  }

  async updateMemory(
    userId: string,
    id: string,
    patch: Partial<Pick<MemoryRecord, "content" | "enabled">>
  ): Promise<MemoryRecord | null> {
    const { data, error } = await this.client
      .from("memories")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MemoryRecord) ?? null;
  }

  async deleteMemory(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("memories")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  /* -- permission rules -- */
  async createPermissionRule(
    userId: string,
    input: import("./index").PermissionRuleInsert
  ): Promise<PermissionRuleRecord> {
    const { data, error } = await this.client
      .from("permission_rules")
      .insert({
        user_id: userId,
        text: input.text,
        target: input.target,
        verb: input.verb,
        condition: input.condition,
        requirement: input.requirement,
        confidence: input.confidence,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as PermissionRuleRecord;
  }

  async listPermissionRules(userId: string): Promise<PermissionRuleRecord[]> {
    const { data, error } = await this.client
      .from("permission_rules")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PermissionRuleRecord[];
  }

  async updatePermissionRule(
    userId: string,
    id: string,
    patch: Partial<Pick<PermissionRuleRecord, "enabled" | "requirement">>
  ): Promise<PermissionRuleRecord | null> {
    const { data, error } = await this.client
      .from("permission_rules")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as PermissionRuleRecord) ?? null;
  }

  async deletePermissionRule(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("permission_rules")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  /* -- objectives -- */
  async createObjective(
    userId: string,
    title: string,
    targetDate: string | null
  ): Promise<ObjectiveRecord> {
    const { data, error } = await this.client
      .from("objectives")
      .insert({ user_id: userId, title, target_date: targetDate })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ObjectiveRecord;
  }

  async listObjectives(userId: string): Promise<ObjectiveRecord[]> {
    const { data, error } = await this.client
      .from("objectives")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ObjectiveRecord[];
  }

  async getObjective(userId: string, id: string): Promise<ObjectiveRecord | null> {
    const { data, error } = await this.client
      .from("objectives")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ObjectiveRecord) ?? null;
  }

  async updateObjective(
    userId: string,
    id: string,
    patch: Partial<Pick<ObjectiveRecord, "title" | "target_date" | "status">>
  ): Promise<ObjectiveRecord | null> {
    const { data, error } = await this.client
      .from("objectives")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ObjectiveRecord) ?? null;
  }

  async deleteObjective(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("objectives")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async linkObjectiveDelegation(userId: string, objectiveId: string, sessionId: string): Promise<void> {
    const { error } = await this.client
      .from("objective_links")
      .upsert(
        { objective_id: objectiveId, session_id: sessionId, user_id: userId },
        { onConflict: "objective_id,session_id", ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);
  }

  async unlinkObjectiveDelegation(userId: string, objectiveId: string, sessionId: string): Promise<void> {
    const { error } = await this.client
      .from("objective_links")
      .delete()
      .eq("user_id", userId)
      .eq("objective_id", objectiveId)
      .eq("session_id", sessionId);
    if (error) throw new Error(error.message);
  }

  async listObjectiveLinks(userId: string, objectiveId?: string): Promise<ObjectiveLinkRecord[]> {
    let query = this.client.from("objective_links").select("*").eq("user_id", userId);
    if (objectiveId) query = query.eq("objective_id", objectiveId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as ObjectiveLinkRecord[];
  }

  /* -- cosigno hold -- */
  async getHold(userId: string): Promise<HoldRecord> {
    const { data, error } = await this.client
      .from("user_hold")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as HoldRecord) ?? { user_id: userId, scope: "none", updated_at: new Date().toISOString() };
  }

  async setHold(userId: string, scope: HoldRecord["scope"]): Promise<HoldRecord> {
    const { data, error } = await this.client
      .from("user_hold")
      .upsert({ user_id: userId, scope, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as HoldRecord;
  }

  /* -- temporary authority -- */
  async grantTemporaryAuthority(
    userId: string,
    category: TemporaryAuthorityRecord["category"],
    expiresAt: string,
    note: string | null
  ): Promise<TemporaryAuthorityRecord> {
    const { data, error } = await this.client
      .from("temporary_authority")
      .insert({ user_id: userId, category, tier: 1, expires_at: expiresAt, note })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as TemporaryAuthorityRecord;
  }

  async listTemporaryAuthority(userId: string): Promise<TemporaryAuthorityRecord[]> {
    const { data, error } = await this.client
      .from("temporary_authority")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as TemporaryAuthorityRecord[];
  }

  async revokeTemporaryAuthority(
    userId: string,
    id: string
  ): Promise<TemporaryAuthorityRecord | null> {
    const { data, error } = await this.client
      .from("temporary_authority")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as TemporaryAuthorityRecord) ?? null;
  }

  /* -- saved signature -- */
  async getSignature(userId: string): Promise<SignatureRecord | null> {
    const { data, error } = await this.client
      .from("signatures")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SignatureRecord) ?? null;
  }

  async saveSignature(userId: string, name: string, image: string): Promise<SignatureRecord> {
    const { data, error } = await this.client
      .from("signatures")
      .upsert({ user_id: userId, name, image, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as SignatureRecord;
  }

  async deleteSignature(userId: string): Promise<void> {
    const { error } = await this.client.from("signatures").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  /* -- autopilot -- */
  async ensureSignalStates(userId: string, keys: string[]): Promise<SignalStateRecord[]> {
    if (keys.length === 0) return [];
    const now = new Date().toISOString();
    // Insert-if-missing without clobbering existing dispositions: upsert with
    // ignoreDuplicates leaves rows that already exist completely untouched.
    const { error: upsertError } = await this.client.from("autopilot_signal_states").upsert(
      keys.map((signal_key) => ({
        user_id: userId,
        signal_key,
        status: "new",
        first_seen: now,
        updated_at: now,
      })),
      { onConflict: "user_id,signal_key", ignoreDuplicates: true }
    );
    if (upsertError) throw new Error(upsertError.message);
    const { data, error } = await this.client
      .from("autopilot_signal_states")
      .select("*")
      .eq("user_id", userId)
      .in("signal_key", keys);
    if (error) throw new Error(error.message);
    return (data ?? []) as SignalStateRecord[];
  }

  async setSignalStatus(
    userId: string,
    signalKey: string,
    status: SignalStateStatus
  ): Promise<SignalStateRecord | null> {
    const { data, error } = await this.client
      .from("autopilot_signal_states")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("signal_key", signalKey)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SignalStateRecord) ?? null;
  }

  async markSignalsSeen(userId: string): Promise<void> {
    const { error } = await this.client
      .from("autopilot_signal_states")
      .update({ status: "seen", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "new");
    if (error) throw new Error(error.message);
  }

  async getAutopilotViewedAt(userId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("autopilot_meta")
      .select("viewed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.viewed_at as string) ?? null;
  }

  async setAutopilotViewedAt(userId: string, iso: string): Promise<void> {
    const { error } = await this.client
      .from("autopilot_meta")
      .upsert({ user_id: userId, viewed_at: iso });
    if (error) throw new Error(error.message);
  }

  async getPrefs(userId: string): Promise<UserPrefs> {
    const { data, error } = await this.client
      .from("user_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as UserPrefs | null;
    return {
      user_id: userId,
      memory_enabled: row?.memory_enabled ?? true,
      action_budget: row?.action_budget ?? DEFAULT_ACTION_BUDGET,
    };
  }

  async setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
    const { error } = await this.client
      .from("user_prefs")
      .upsert({ user_id: userId, memory_enabled: enabled, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  async setActionBudget(userId: string, budget: number): Promise<void> {
    const { error } = await this.client
      .from("user_prefs")
      .upsert({
        user_id: userId,
        action_budget: clampBudget(budget),
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  }

  /* -- internal AI cost ledger (service role only; no client RLS grant) -- */
  async recordAiUsage(row: import("../ai/costs").AiUsageRow): Promise<void> {
    const { error } = await this.client.from("ai_usage").insert(row);
    if (error) throw new Error(error.message);
  }

  async aiCostForMission(userId: string, missionId: string): Promise<number> {
    const { data, error } = await this.client
      .from("ai_usage")
      .select("est_cost_usd")
      .eq("user_id", userId)
      .eq("mission_id", missionId);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0);
  }

  async aiCostForUserMonth(userId: string): Promise<number> {
    const { data, error } = await this.client
      .from("ai_usage")
      .select("est_cost_usd")
      .eq("user_id", userId)
      .gte("created_at", cycleStart());
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0);
  }

  async listAiUsageSince(sinceIso: string): Promise<import("./index").StoredAiUsage[]> {
    const { data, error } = await this.client
      .from("ai_usage")
      .select("*")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20_000);
    if (error) throw new Error(error.message);
    return (data ?? []) as import("./index").StoredAiUsage[];
  }


  /* -- files -- */
  async createFile(input: import("./index").FileInsert): Promise<FileRecord> {
    const { data, error } = await this.client
      .from("files")
      .insert({
        user_id: input.user_id,
        session_id: input.session_id ?? null,
        name: input.name,
        mime: input.mime,
        content: input.content,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as FileRecord;
  }

  async listFiles(userId: string): Promise<FileRecord[]> {
    const { data, error } = await this.client
      .from("files")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as FileRecord[];
  }

  async getFile(userId: string, id: string): Promise<FileRecord | null> {
    const { data, error } = await this.client
      .from("files")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as FileRecord) ?? null;
  }

  async updateFile(
    userId: string,
    id: string,
    patch: Partial<Pick<FileRecord, "name" | "content">>
  ): Promise<FileRecord | null> {
    const existing = await this.getFile(userId, id);
    if (!existing) return null;
    const { data, error } = await this.client
      .from("files")
      .update({ ...patch, version: existing.version + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as FileRecord) ?? null;
  }

  async deleteFile(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("files")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  /* -- durable missions -- */
  async createMission(input: import("./index").MissionInsert): Promise<MissionRecord> {
    const { data, error } = await this.client
      .from("missions")
      .insert({ user_id: input.user_id, session_id: input.session_id, goal: input.goal })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MissionRecord;
  }

  async getMission(userId: string, id: string): Promise<MissionRecord | null> {
    const { data, error } = await this.client
      .from("missions")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MissionRecord) ?? null;
  }

  async listMissions(userId: string, limit = 50): Promise<MissionRecord[]> {
    const { data, error } = await this.client
      .from("missions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as MissionRecord[];
  }

  async updateMission(
    userId: string,
    id: string,
    patch: Partial<
      Pick<MissionRecord, "state" | "plan_version" | "pending_question" | "receipt" | "error" | "completed_at" | "lease_owner" | "lease_expires_at" | "tool_calls" | "browser_actions" | "budget_cents" | "action_budget">
    >
  ): Promise<MissionRecord | null> {
    const { data, error } = await this.client
      .from("missions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MissionRecord) ?? null;
  }

  async listRunnableMissions(limit: number): Promise<MissionRecord[]> {
    const { data, error } = await this.client
      .from("missions")
      .select("*")
      .in("state", [...RUNNABLE_MISSION_STATES])
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as MissionRecord[];
  }

  async claimMissionLease(missionId: string, owner: string, ttlMs: number): Promise<MissionRecord | null> {
    // Atomic claim: only succeeds when no live lease exists. The conditional
    // update (lease_expires_at is null OR in the past) makes two concurrent
    // workers mutually exclusive — the DB serializes the write.
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + ttlMs).toISOString();
    const { data, error } = await this.client
      .from("missions")
      .update({ lease_owner: owner, lease_expires_at: expiresIso })
      .eq("id", missionId)
      .or(`lease_owner.is.null,lease_expires_at.lt.${nowIso},lease_owner.eq.${owner}`)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MissionRecord) ?? null;
  }

  async releaseMissionLease(missionId: string, owner: string): Promise<void> {
    const { error } = await this.client
      .from("missions")
      .update({ lease_owner: null, lease_expires_at: null })
      .eq("id", missionId)
      .eq("lease_owner", owner);
    if (error) throw new Error(error.message);
  }

  /* -- browser operator -- */
  async createBrowserSession(input: import("./index").BrowserSessionInsert): Promise<BrowserSessionRecord> {
    const { data, error } = await this.client
      .from("browser_sessions")
      .insert({
        user_id: input.user_id,
        mission_id: input.mission_id,
        operator: input.operator,
        provider: input.provider,
        simulated: input.simulated,
        status: "active",
        objective: input.objective,
        provider_ref: input.provider_ref ?? null,
        expires_at: input.expires_at ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as BrowserSessionRecord;
  }

  async getBrowserSession(userId: string, id: string): Promise<BrowserSessionRecord | null> {
    const { data, error } = await this.client
      .from("browser_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BrowserSessionRecord) ?? null;
  }

  async listBrowserSessions(userId: string, missionId: string): Promise<BrowserSessionRecord[]> {
    const { data, error } = await this.client
      .from("browser_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as BrowserSessionRecord[];
  }

  async updateBrowserSession(
    userId: string,
    id: string,
    patch: Partial<Pick<BrowserSessionRecord, "status" | "current_url" | "page_title" | "provider_ref" | "last_action" | "stop_reason" | "screenshot_ref" | "expires_at">>
  ): Promise<BrowserSessionRecord | null> {
    const { data, error } = await this.client
      .from("browser_sessions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BrowserSessionRecord) ?? null;
  }

  async createBrowserAction(input: import("./index").BrowserActionInsert): Promise<BrowserActionRecord> {
    const { data, error } = await this.client
      .from("browser_actions")
      .insert({
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
        state: input.state ?? "proposed",
        detail: input.detail ?? {},
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as BrowserActionRecord;
  }

  async listBrowserActions(userId: string, sessionId: string): Promise<BrowserActionRecord[]> {
    const { data, error } = await this.client
      .from("browser_actions")
      .select("*")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("idx", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as BrowserActionRecord[];
  }

  async updateBrowserAction(
    userId: string,
    id: string,
    patch: Partial<Pick<BrowserActionRecord, "state" | "action_id" | "detail" | "verification">>
  ): Promise<BrowserActionRecord | null> {
    const { data, error } = await this.client
      .from("browser_actions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BrowserActionRecord) ?? null;
  }

  async createBrowserProduct(input: import("./index").BrowserProductInsert): Promise<BrowserProductRecord> {
    const { data, error } = await this.client
      .from("browser_products")
      .insert({
        user_id: input.user_id,
        mission_id: input.mission_id,
        session_id: input.session_id,
        name: input.name,
        brand: input.brand ?? "",
        current_price: input.current_price ?? null,
        currency: input.currency ?? "USD",
        retailer: input.retailer ?? "",
        product_url: input.product_url,
        processor: input.processor ?? null,
        memory: input.memory ?? null,
        storage: input.storage ?? null,
        display: input.display ?? null,
        graphics: input.graphics ?? null,
        battery_claim: input.battery_claim ?? null,
        availability: input.availability ?? null,
        warranty: input.warranty ?? null,
        return_policy: input.return_policy ?? null,
        source_title: input.source_title ?? "",
        injection_flag: input.injection_flag ?? false,
        simulated: input.simulated ?? true,
        accessed_at: input.accessed_at ?? new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as BrowserProductRecord;
  }

  async listBrowserProducts(userId: string, missionId: string): Promise<BrowserProductRecord[]> {
    const { data, error } = await this.client
      .from("browser_products")
      .select("*")
      .eq("user_id", userId)
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as BrowserProductRecord[];
  }

  async createMissionSteps(
    steps: import("./index").MissionStepInsert[]
  ): Promise<MissionStepRecord[]> {
    const { data, error } = await this.client
      .from("mission_steps")
      .insert(
        steps.map((s) => ({
          mission_id: s.mission_id,
          user_id: s.user_id,
          idx: s.idx,
          purpose: s.purpose,
          operator: s.operator,
          tool: s.tool,
          state: s.state ?? "ready",
          depends_on: s.depends_on,
          input: s.input ?? {},
          sources: s.sources ?? [],
          max_retries: s.max_retries ?? 2,
        }))
      )
      .select();
    if (error) throw new Error(error.message);
    return (data ?? []) as MissionStepRecord[];
  }

  async listMissionSteps(userId: string, missionId: string): Promise<MissionStepRecord[]> {
    const { data, error } = await this.client
      .from("mission_steps")
      .select("*")
      .eq("user_id", userId)
      .eq("mission_id", missionId)
      .order("idx", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MissionStepRecord[];
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
    const { data, error } = await this.client
      .from("mission_steps")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MissionStepRecord) ?? null;
  }

  /* -- mission sources -- */
  async createMissionSource(input: import("./index").MissionSourceInsert): Promise<MissionSourceRecord> {
    const { data, error } = await this.client
      .from("mission_sources")
      .insert({
        user_id: input.user_id,
        kind: input.kind,
        name: input.name,
        subtype: input.subtype ?? "",
        size_bytes: input.size_bytes ?? 0,
        status: input.status,
        summary: input.summary ?? "",
        injection_flag: input.injection_flag ?? false,
        detail: input.detail ?? {},
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MissionSourceRecord;
  }

  async getMissionSource(userId: string, id: string): Promise<MissionSourceRecord | null> {
    const { data, error } = await this.client
      .from("mission_sources")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MissionSourceRecord) ?? null;
  }

  async listStagedSources(userId: string): Promise<MissionSourceRecord[]> {
    const { data, error } = await this.client
      .from("mission_sources")
      .select("*")
      .eq("user_id", userId)
      .is("mission_id", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MissionSourceRecord[];
  }

  async listMissionSources(userId: string, missionId: string): Promise<MissionSourceRecord[]> {
    const { data, error } = await this.client
      .from("mission_sources")
      .select("*")
      .eq("user_id", userId)
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MissionSourceRecord[];
  }

  async deleteMissionSource(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from("mission_sources")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async attachSourcesToMission(userId: string, sourceIds: string[], missionId: string): Promise<number> {
    if (sourceIds.length === 0) return 0;
    // Only STAGED sources owned by the user are attached (the is-null guard
    // prevents re-parenting another mission's source).
    const { data, error } = await this.client
      .from("mission_sources")
      .update({ mission_id: missionId, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("mission_id", null)
      .in("id", sourceIds)
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  /* -- workspaces -- */
  async createWorkspace(userId: string, email: string, name: string): Promise<WorkspaceRecord> {
    const { data, error } = await this.client
      .from("workspaces")
      .insert({ owner_user_id: userId, name })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const ws = data as WorkspaceRecord;
    const { error: mErr } = await this.client.from("workspace_members").insert({
      workspace_id: ws.id,
      user_id: userId,
      email: email.toLowerCase(),
      role: "owner",
      status: "active",
    });
    if (mErr) throw new Error(mErr.message);
    return ws;
  }

  async getWorkspaceForUser(userId: string): Promise<WorkspaceRecord | null> {
    const { data, error } = await this.client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.getWorkspace((data as { workspace_id: string }).workspace_id);
  }

  async getWorkspace(id: string): Promise<WorkspaceRecord | null> {
    const { data, error } = await this.client
      .from("workspaces")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as WorkspaceRecord) ?? null;
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const { data, error } = await this.client
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as WorkspaceMemberRecord[];
  }

  async inviteWorkspaceMember(
    workspaceId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">
  ): Promise<WorkspaceMemberRecord> {
    const { data, error } = await this.client
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, email: email.toLowerCase(), role, status: "invited" })
      .select()
      .single();
    if (error) {
      // unique (workspace_id, email) — surface as the same error the memory
      // store raises so routes translate it identically.
      if (error.code === "23505") throw new Error("already_invited");
      throw new Error(error.message);
    }
    return data as WorkspaceMemberRecord;
  }

  async acceptWorkspaceInvites(userId: string, email: string): Promise<WorkspaceMemberRecord | null> {
    const active = await this.getWorkspaceForUser(userId);
    if (active) return null; // v1: one workspace per user
    const { data, error } = await this.client
      .from("workspace_members")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("status", "invited")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const invite = data as WorkspaceMemberRecord;
    const { data: updated, error: uErr } = await this.client
      .from("workspace_members")
      .update({ user_id: userId, status: "active", updated_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("status", "invited")
      .select()
      .maybeSingle();
    if (uErr) throw new Error(uErr.message);
    return (updated as WorkspaceMemberRecord) ?? null;
  }

  async updateWorkspaceMember(
    workspaceId: string,
    memberId: string,
    patch: Partial<Pick<WorkspaceMemberRecord, "role">>
  ): Promise<WorkspaceMemberRecord | null> {
    const { data, error } = await this.client
      .from("workspace_members")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", memberId)
      .eq("workspace_id", workspaceId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as WorkspaceMemberRecord) ?? null;
  }

  async removeWorkspaceMember(workspaceId: string, memberId: string): Promise<void> {
    const { error } = await this.client
      .from("workspace_members")
      .delete()
      .eq("id", memberId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
  }

  async deleteWorkspace(id: string): Promise<void> {
    // workspace_members cascade via FK ON DELETE CASCADE.
    const { error } = await this.client.from("workspaces").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listProposedActionsForUsers(userIds: string[], limit = 50): Promise<ActionRecord[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await this.client
      .from("actions")
      .select("*")
      .in("user_id", userIds)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActionRecord[];
  }

  async deleteAllUserData(userId: string): Promise<void> {
    // Workspaces they OWN dissolve entirely (members cascade); memberships
    // elsewhere are removed below.
    const { data: owned, error: wsErr } = await this.client
      .from("workspaces")
      .select("id")
      .eq("owner_user_id", userId);
    if (wsErr) throw new Error(wsErr.message);
    for (const w of (owned ?? []) as { id: string }[]) {
      await this.deleteWorkspace(w.id);
    }
    const { error: memErr } = await this.client
      .from("workspace_members")
      .delete()
      .eq("user_id", userId);
    if (memErr) throw new Error(memErr.message);

    // sessions cascade to messages/actions/action_events via FK ON DELETE
    // CASCADE; the rest are deleted explicitly. Missions cascade to
    // mission_steps + browser_sessions + browser_actions via FK.
    for (const table of [
      "browser_products",
      "browser_actions",
      "browser_sessions",
      "mission_sources",
      "mission_steps",
      "missions",
      "autopilot_signal_states",
      "autopilot_meta",
      "signatures",
      "temporary_authority",
      "objective_links",
      "objectives",
      "user_hold",
      "files",
      "permission_rules",
      "memories",
      "user_prefs",
      "automation_runs",
      "automations",
      "account_audit",
      "promotions",
      "integrations",
      "mcp_tools",
      "oauth_states",
      "connections",
      "tier_settings",
      "usage",
      "subscriptions",
      "sessions",
      "actions",
      "action_events",
      "messages",
    ]) {
      const { error } = await this.client.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
  }
}
