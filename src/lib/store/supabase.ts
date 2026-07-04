import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  ActionEventRecord,
  ActionEventType,
  ActionRecord,
  ActionStatus,
  BETA_ACTION_LIMIT,
  BetaApplication,
  canTransition,
  MessageRecord,
  SessionRecord,
  TierSettingRecord,
  UsageRecord,
} from "../types";
import type { ActionInsert, ActivityFilter, Store } from "./index";

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
    this.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
    // The Postgres function revalidates the transition atomically.
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

  async listEvents(userId: string, actionId?: string): Promise<ActionEventRecord[]> {
    let query = this.client
      .from("action_events")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (actionId) query = query.eq("action_id", actionId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
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

  async incrementUsage(userId: string): Promise<UsageRecord> {
    const usage = await this.getUsage(userId);
    const { data, error } = await this.client.rpc("increment_usage", {
      p_user_id: userId,
      p_cycle_start: usage.cycle_start,
    });
    if (error) throw new Error(error.message);
    return data as UsageRecord;
  }

  async createBetaApplication(app: BetaApplication): Promise<void> {
    const { error } = await this.client.from("beta_applications").insert(app);
    if (error) throw new Error(error.message);
  }
}
