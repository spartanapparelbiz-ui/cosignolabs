-- cosigno — all database migrations, combined for a single paste.
-- Paste this whole file into Supabase → SQL Editor → New query → Run (once).
-- Run this ONCE on a FRESH Supabase project (a new empty database).
-- These are ordered schema migrations; running them a second time may error
-- on tables that already exist. That is fine -- the first run built everything.

-- ============================================================
-- 0001_init.sql
-- ============================================================
-- cosigno · initial schema
-- Security model:
--  * RLS is enabled on every table.
--  * Authenticated users (Clerk JWT via Supabase third-party auth; user id in
--    auth.jwt()->>'sub') can READ their own rows.
--  * All writes flow through server routes using the service role. The one
--    hard invariant, enforced three ways (RLS, column grants, trigger):
--    a client can NEVER set or change actions.status.

create type action_status as enum
  ('proposed', 'approved', 'vetoed', 'executing', 'executed', 'failed');

create type action_event_type as enum
  ('proposed', 'approved', 'edited', 'vetoed', 'executing', 'executed',
   'failed', 'blocked', 'flagged');

-- Clerk-synced users (populated by webhook or on first request).
create table users (
  id text primary key,            -- Clerk user id
  email text,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'New session',
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id, created_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('user', 'agent')),
  content text not null,
  created_at timestamptz not null default now()
);
create index messages_session_idx on messages (session_id, created_at);

create table actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id text not null,
  category text not null,
  tier smallint not null check (tier in (1, 2, 3)),
  status action_status not null default 'proposed',
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  veto_reason text,
  injection_flag boolean not null default false,
  tier_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index actions_user_idx on actions (user_id, created_at desc);
create index actions_session_idx on actions (session_id, created_at desc);
create index actions_status_idx on actions (user_id, status);

-- Immutable audit log. No update/delete grants, ever.
create table action_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  user_id text not null,
  type action_event_type not null,
  actor text not null check (actor in ('user', 'agent', 'system')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index action_events_action_idx on action_events (action_id, created_at);
create index action_events_user_idx on action_events (user_id, created_at desc);

create table tier_settings (
  user_id text not null,
  category text not null,
  tier smallint not null check (tier in (1, 2)),  -- tier 3 is pinned in code and here
  primary key (user_id, category)
);

create table usage (
  user_id text not null,
  cycle_start timestamptz not null,
  actions_executed integer not null default 0,
  "limit" integer not null default 200,
  primary key (user_id, cycle_start)
);

create table beta_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  tools text not null,
  workflow text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table users             enable row level security;
alter table sessions          enable row level security;
alter table messages          enable row level security;
alter table actions           enable row level security;
alter table action_events     enable row level security;
alter table tier_settings     enable row level security;
alter table usage             enable row level security;
alter table beta_applications enable row level security;

create or replace function auth_uid() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'sub', '')
$$;

-- Users see only their own rows. (Realtime subscriptions honor these too.)
create policy users_self        on users             for select using (id = auth_uid());
create policy sessions_self     on sessions          for select using (user_id = auth_uid());
create policy messages_self     on messages          for select using (user_id = auth_uid());
create policy actions_self      on actions           for select using (user_id = auth_uid());
create policy events_self       on action_events     for select using (user_id = auth_uid());
create policy tiers_self        on tier_settings     for select using (user_id = auth_uid());
create policy usage_self        on usage             for select using (user_id = auth_uid());
-- beta_applications: no client policies at all — service role only.

-- Clients may create sessions/messages of their own...
create policy sessions_insert on sessions for insert with check (user_id = auth_uid());
create policy messages_insert on messages for insert with check (user_id = auth_uid());

-- ...and edit ONLY the payload/summary of their own PROPOSED actions.
-- No insert policy: proposals are created by the server (agent pipeline).
create policy actions_edit_proposed on actions for update
  using (user_id = auth_uid() and status = 'proposed')
  with check (user_id = auth_uid() and status = 'proposed');

-- Column-level defense: even where the update policy passes, the client
-- role can only touch payload and summary — never status, tier, result,
-- injection_flag, or resolved_at.
revoke update on actions from authenticated, anon;
grant  update (payload, summary) on actions to authenticated;
revoke insert, update, delete on action_events from authenticated, anon;
revoke all on usage from authenticated, anon;
grant  select on usage to authenticated;
revoke all on beta_applications from authenticated, anon;

-- Tier settings: user may move unpinned categories between 1 and 2 (the
-- check constraint forbids 3; pinned categories are also enforced in the
-- server route, which is the only writer in practice).
create policy tiers_upsert on tier_settings for insert with check (user_id = auth_uid());
create policy tiers_update on tier_settings for update
  using (user_id = auth_uid()) with check (user_id = auth_uid());

-- ---------------------------------------------------------------------------
-- Status state machine — the only way status ever changes.
-- ---------------------------------------------------------------------------
create or replace function valid_action_transition(p_from action_status, p_to action_status)
returns boolean language sql immutable as $$
  select case
    when p_from = 'proposed'  and p_to in ('approved', 'vetoed') then true
    when p_from = 'approved'  and p_to = 'executing'             then true
    when p_from = 'executing' and p_to in ('executed', 'failed') then true
    else false
  end
$$;

-- Belt-and-braces trigger: no writer (including a buggy server path) can
-- skip states, and terminal states are immutable.
create or replace function enforce_action_transition() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not valid_action_transition(old.status, new.status) then
      raise exception 'invalid action status transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end
$$;

create trigger actions_transition_guard
  before update on actions
  for each row execute function enforce_action_transition();

-- Server RPC used by the app (service role): transition + patch atomically.
create or replace function transition_action(
  p_action_id uuid,
  p_user_id text,
  p_new_status action_status,
  p_result jsonb default null,
  p_veto_reason text default null,
  p_payload jsonb default null,
  p_summary text default null
) returns actions
language plpgsql security definer set search_path = public as $$
declare
  v_action actions;
begin
  select * into v_action from actions
    where id = p_action_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'action_not_found';
  end if;
  if not valid_action_transition(v_action.status, p_new_status) then
    raise exception 'invalid action status transition: % -> %', v_action.status, p_new_status;
  end if;

  update actions set
    status      = p_new_status,
    result      = coalesce(p_result, result),
    veto_reason = coalesce(p_veto_reason, veto_reason),
    payload     = coalesce(p_payload, payload),
    summary     = coalesce(p_summary, summary),
    resolved_at = case when p_new_status in ('executed', 'failed', 'vetoed')
                       then now() else resolved_at end
  where id = p_action_id
  returning * into v_action;

  return v_action;
end
$$;
revoke all on function transition_action from public, authenticated, anon;

create or replace function increment_usage(p_user_id text, p_cycle_start timestamptz)
returns usage
language plpgsql security definer set search_path = public as $$
declare
  v_usage usage;
begin
  insert into usage (user_id, cycle_start)
    values (p_user_id, p_cycle_start)
    on conflict (user_id, cycle_start) do nothing;
  update usage set actions_executed = actions_executed + 1
    where user_id = p_user_id and cycle_start = p_cycle_start
    returning * into v_usage;
  return v_usage;
end
$$;
revoke all on function increment_usage from public, authenticated, anon;

-- Realtime change feed for the workspace card stack.
alter publication supabase_realtime add table actions;

-- ============================================================
-- 0002_hardening.sql
-- ============================================================
-- cosigno · security hardening
--
-- Tightens the client surface to READ-ONLY. After this migration the anon /
-- authenticated roles can:
--   * SELECT their own rows (sessions, messages, actions, action_events,
--     tier_settings, usage) — that's it.
-- ALL writes (including session/message creation and proposal edits) go
-- through server routes using the service-role key. beta_applications has
-- no client policies at all: insert AND select are server-only.

-- 1. Drop every client write policy from 0001.
drop policy if exists sessions_insert       on sessions;
drop policy if exists messages_insert       on messages;
drop policy if exists actions_edit_proposed on actions;
drop policy if exists tiers_upsert          on tier_settings;
drop policy if exists tiers_update          on tier_settings;

-- 2. Belt-and-braces: revoke all write privileges from client roles on
--    every table (RLS is deny-by-default without policies, but revoking
--    the grants removes the capability entirely).
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated, anon;

-- Client roles keep SELECT only (scoped by the *_self RLS policies).
grant select on users, sessions, messages, actions, action_events,
             tier_settings, usage to authenticated;
revoke all on beta_applications from authenticated, anon;

-- Default privileges for future tables: nothing for client roles.
alter default privileges in schema public
  revoke all on tables from authenticated, anon;

-- 3. Injection containment inside the database: a flagged action can never
--    be approved or start executing, no matter which code path asks.
create or replace function enforce_action_transition() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not valid_action_transition(old.status, new.status) then
      raise exception 'invalid action status transition: % -> %', old.status, new.status;
    end if;
    if new.status in ('approved', 'executing') and old.injection_flag then
      raise exception 'injection_blocked: flagged actions cannot be approved or executed';
    end if;
  end if;
  -- injection_flag is set at proposal time and immutable afterwards.
  if new.injection_flag is distinct from old.injection_flag then
    raise exception 'injection_flag is immutable';
  end if;
  return new;
end
$$;

-- 4. Same check inside the transition RPC (the trigger fires anyway; this
--    yields the cleaner error before the UPDATE).
create or replace function transition_action(
  p_action_id uuid,
  p_user_id text,
  p_new_status action_status,
  p_result jsonb default null,
  p_veto_reason text default null,
  p_payload jsonb default null,
  p_summary text default null
) returns actions
language plpgsql security definer set search_path = public as $$
declare
  v_action actions;
begin
  select * into v_action from actions
    where id = p_action_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'action_not_found';
  end if;
  if not valid_action_transition(v_action.status, p_new_status) then
    raise exception 'invalid action status transition: % -> %', v_action.status, p_new_status;
  end if;
  if p_new_status in ('approved', 'executing') and v_action.injection_flag then
    raise exception 'injection_blocked: flagged actions cannot be approved or executed';
  end if;

  update actions set
    status      = p_new_status,
    result      = coalesce(p_result, result),
    veto_reason = coalesce(p_veto_reason, veto_reason),
    payload     = coalesce(p_payload, payload),
    summary     = coalesce(p_summary, summary),
    resolved_at = case when p_new_status in ('executed', 'failed', 'vetoed')
                       then now() else resolved_at end
  where id = p_action_id
  returning * into v_action;

  return v_action;
end
$$;
revoke all on function transition_action from public, authenticated, anon;

-- 5. RPCs are service-role-only; re-affirm for increment_usage as well.
revoke all on function increment_usage from public, authenticated, anon;

-- ============================================================
-- 0003_billing.sql
-- ============================================================
-- cosigno · billing
--
-- Subscription state written EXCLUSIVELY by the Stripe webhook (service
-- role). Clients may read only their own row; they have no insert/update/
-- delete path — plan enforcement never trusts the client.

create table subscriptions (
  user_id text primary key,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free',
  interval text,
  status text not null default 'active',
  current_period_end bigint,
  cancel_at_period_end boolean not null default false,
  past_due_since bigint,
  updated_at timestamptz not null default now()
);
create index subscriptions_customer_idx on subscriptions (stripe_customer_id);

alter table subscriptions enable row level security;

-- Read-your-own only. No write policies at all → service role is the only
-- writer (the webhook). Belt-and-braces: revoke client write grants.
create policy subscriptions_self on subscriptions
  for select using (user_id = auth_uid());

revoke insert, update, delete on subscriptions from authenticated, anon;
grant select on subscriptions to authenticated;

-- ============================================================
-- 0004_integrations.sql
-- ============================================================
-- cosigno · integration connections
--
-- Tracks which integrations a user has connected, so the plan's integration
-- limit can be enforced server-side on connect. Writes go through the server
-- route (service role); clients read their own rows only.

create table integrations (
  user_id text not null,
  key text not null,
  connected_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table integrations enable row level security;

create policy integrations_self on integrations
  for select using (user_id = auth_uid());

revoke insert, update, delete on integrations from authenticated, anon;
grant select on integrations to authenticated;

-- ============================================================
-- 0005_account.sql
-- ============================================================
-- cosigno · account audit + connected_at
--
-- Account audit trail (tier changes, integration connect/disconnect, account
-- deletion) surfaced in the Security cockpit. Written by server routes; RLS
-- lets a user read only their own rows.

create table account_audit (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index account_audit_user_idx on account_audit (user_id, created_at desc);

alter table account_audit enable row level security;
create policy account_audit_self on account_audit
  for select using (user_id = auth_uid());
revoke insert, update, delete on account_audit from authenticated, anon;
grant select on account_audit to authenticated;

-- ============================================================
-- 0006_promotions.sql
-- ============================================================
-- cosigno · promotions (single-use offers) + subscription start time
--
-- One row per (user, offer) enforces "each offer is claimable exactly once
-- per customer, ever" at the database level. Written by server routes /
-- webhook only; RLS lets a user read their own rows (so the UI can hide
-- already-claimed offers) but never write them.

create table promotions (
  user_id text not null,
  offer text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, offer)
);
create index promotions_user_idx on promotions (user_id);

alter table promotions enable row level security;
create policy promotions_self on promotions
  for select using (user_id = auth_uid());
revoke insert, update, delete on promotions from authenticated, anon;
grant select on promotions to authenticated;

-- When the Stripe subscription was created — powers the 14-day refund window.
alter table subscriptions add column if not exists started_at bigint;

-- ============================================================
-- 0007_connections.sql
-- ============================================================
-- cosigno · integrations v2 (connections, custom MCP, OAuth state)
--
-- Supersedes the boolean `integrations` table (kept for back-compat). A
-- connection is a per-user link to a third-party app or a custom MCP server.
--
-- Security model (consistent with the rest of the schema):
--   * RLS on every table; a client may READ only its own rows.
--   * encrypted_credentials is NEVER exposed to clients — it's revoked from
--     the authenticated role's column grants, and the app reads/writes it
--     only through the service role in server routes.
--   * All writes flow through server routes using the service role.

create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider_key text not null,                 -- provider key, or 'mcp'
  kind text not null check (kind in ('app', 'mcp')),
  display_name text not null,
  status text not null default 'connected'
    check (status in ('connected', 'needs_reauth', 'error', 'revoked')),
  auth_type text not null check (auth_type in ('oauth2', 'apikey', 'mcp_remote')),
  encrypted_credentials text,                 -- AES-256-GCM blob, service-role only
  scopes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_health_at timestamptz
);
create index connections_user_idx on connections (user_id, created_at desc);

create table mcp_tools (
  connection_id uuid not null references connections (id) on delete cascade,
  user_id text not null,                      -- denormalized for RLS
  name text not null,
  description text not null default '',
  input_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,     -- off until the user opts in
  sensitive boolean not null default false,
  consented_at timestamptz,                   -- required before a sensitive tool runs
  primary key (connection_id, name)
);
create index mcp_tools_user_idx on mcp_tools (user_id);

-- Short-lived OAuth authorization state (CSRF + PKCE verifier). Rows are
-- consumed once on callback and expire; a sweep can delete stale rows.
create table oauth_states (
  state text primary key,
  user_id text not null,
  provider_key text not null,
  code_verifier text,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index oauth_states_expiry_idx on oauth_states (expires_at);

alter table connections enable row level security;
alter table mcp_tools   enable row level security;
alter table oauth_states enable row level security;

-- Clients may read their own connection rows, but NOT the secret column.
revoke all on connections from authenticated, anon;
grant select
  (id, user_id, provider_key, kind, display_name, status, auth_type,
   scopes, metadata, created_at, updated_at, last_health_at)
  on connections to authenticated;
create policy connections_self on connections
  for select using (user_id = auth_uid());

grant select on mcp_tools to authenticated;
create policy mcp_tools_self on mcp_tools
  for select using (user_id = auth_uid());

-- oauth_states is service-role only (transient secrets); no client access.
revoke all on oauth_states from authenticated, anon;

-- All writes to these tables happen via the service role; block client writes.
revoke insert, update, delete on connections from authenticated, anon;
revoke insert, update, delete on mcp_tools  from authenticated, anon;

-- ============================================================
-- 0008_automations.sql
-- ============================================================
-- cosigno · automations (recurring missions)
--
-- An automation is a saved command that re-runs on an interval. Every run
-- goes through the exact same pipeline as a typed command: usage gates,
-- rate limits, the planner, and the approval state machine — so a run can
-- PROPOSE cards but never execute anything the user hasn't signed (tier-1
-- reads excepted, as everywhere).

create table automations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  command text not null,
  interval_hours int not null check (interval_hours between 1 and 720),
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automations_user_idx on automations (user_id, created_at desc);
-- the tick's hot path: enabled + due
create index automations_due_idx on automations (next_run_at) where enabled;

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations (id) on delete cascade,
  user_id text not null,                    -- denormalized for RLS
  status text not null check (status in ('ok', 'error')),
  detail text,                              -- proposal count or safe error note
  session_id uuid,                          -- the mission the run created
  created_at timestamptz not null default now()
);
create index automation_runs_automation_idx on automation_runs (automation_id, created_at desc);
create index automation_runs_user_idx on automation_runs (user_id, created_at desc);

-- RLS: users read their own; ALL writes go through the service role.
alter table automations enable row level security;
alter table automation_runs enable row level security;

revoke all on automations from authenticated, anon;
grant select on automations to authenticated;
create policy automations_self on automations
  for select using (user_id = auth_uid());

revoke all on automation_runs from authenticated, anon;
grant select on automation_runs to authenticated;
create policy automation_runs_self on automation_runs
  for select using (user_id = auth_uid());

-- ============================================================
-- 0009_memory.sql
-- ============================================================
-- cosigno · user-controlled memory
--
-- Short operational notes the USER saves ("i prefer replies under 100 words",
-- "my priority this month is the acme launch") that are fed to the planner as
-- explicit user context. Never invisible, never uncontrollable: full CRUD,
-- per-memory enable, and a master switch. The agent never writes memory.

create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content text not null check (char_length(content) <= 300),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_user_idx on memories (user_id, created_at desc);

create table user_prefs (
  user_id text primary key,
  memory_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table memories enable row level security;
alter table user_prefs enable row level security;

revoke all on memories from authenticated, anon;
grant select on memories to authenticated;
create policy memories_self on memories
  for select using (user_id = auth_uid());

revoke all on user_prefs from authenticated, anon;
grant select on user_prefs to authenticated;
create policy user_prefs_self on user_prefs
  for select using (user_id = auth_uid());

-- ============================================================
-- 0010_files.sql
-- ============================================================
-- cosigno · files (mission-aware, text-based v1)
--
-- Text deliverables and user documents: notes, markdown, CSV. Content lives
-- in-row (bounded 80k chars ≈ the API body cap) — binary files are a later
-- phase (needs a storage bucket decision). Optionally linked to the mission
-- (session) that produced them. Edits bump `version`.

create table files (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id uuid,                     -- the mission this belongs to, if any
  name text not null check (char_length(name) <= 120),
  mime text not null check (mime in ('text/plain', 'text/markdown', 'text/csv')),
  content text not null check (char_length(content) <= 80000),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index files_user_idx on files (user_id, updated_at desc);
create index files_session_idx on files (session_id);

alter table files enable row level security;
revoke all on files from authenticated, anon;
grant select on files to authenticated;
create policy files_self on files
  for select using (user_id = auth_uid());

-- ============================================================
-- 0011_workspaces.sql
-- ============================================================
-- cosigno · workspaces (teams / household)
--
-- One small, honest sharing model: a user owns at most one workspace, invites
-- people by email, and members hold a role. Roles gate DELEGATED APPROVALS:
-- an owner/approver may approve or veto a workspace-mate's tier-2 (write)
-- proposals through the same engine door. Tier-3 (destructive) approvals stay
-- personal — only the action's owner can type the confirmation. The agent
-- gains no new powers from a workspace; only humans are added.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  name text not null check (char_length(name) <= 80),
  created_at timestamptz not null default now()
);
create index workspaces_owner_idx on workspaces (owner_user_id);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  -- null until the invited email signs in and the invite is accepted.
  user_id text,
  email text not null check (char_length(email) <= 200),
  role text not null default 'member' check (role in ('owner', 'approver', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index workspace_members_ws_idx on workspace_members (workspace_id);
create index workspace_members_user_idx on workspace_members (user_id);
create index workspace_members_email_idx on workspace_members (email);

alter table workspaces enable row level security;
alter table workspace_members enable row level security;

-- Members can see their workspace and its member list; all writes go through
-- the server (service role) so invites/role changes are always policy-checked.
-- The membership check lives in a SECURITY DEFINER function so the
-- workspace_members policy doesn't recurse into itself.
create or replace function is_workspace_member(ws uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws
      and user_id = auth_uid()
      and status = 'active'
  );
$$;
revoke all on function is_workspace_member(uuid) from public;
grant execute on function is_workspace_member(uuid) to authenticated;

revoke all on workspaces from authenticated, anon;
grant select on workspaces to authenticated;
create policy workspaces_member_select on workspaces
  for select using (is_workspace_member(id));

revoke all on workspace_members from authenticated, anon;
grant select on workspace_members to authenticated;
create policy workspace_members_member_select on workspace_members
  for select using (is_workspace_member(workspace_id));

-- ============================================================
-- 0012_missions.sql
-- ============================================================
-- cosigno · durable mission engine
--
-- Missions are persistent units of multi-step work that progress SERVER-SIDE:
-- state lives here, and the engine advances it on ticks (cron + user-present
-- polling) — never inside a React component. Closing the tab, logging out, a
-- slow provider, or a worker restart cannot lose progress: every step is a
-- checkpointed row with retries, and consequential steps block on the same
-- action-card approval door as everything else (mission_steps.action_id links
-- the card). Nothing here bypasses the approval state machine.

create table missions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  -- the workspace session the mission's cards + messages live in
  session_id uuid not null,
  goal text not null check (char_length(goal) <= 500),
  state text not null default 'queued' check (state in (
    'queued', 'running', 'awaiting_input', 'awaiting_approval', 'retrying',
    'verifying', 'paused', 'completed', 'partial', 'failed', 'stopped', 'blocked'
  )),
  plan_version int not null default 1,
  -- a structured question blocking one step, null otherwise
  pending_question jsonb,
  -- the final mission receipt (deliverables, sources, verifications)
  receipt jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index missions_user_idx on missions (user_id, created_at desc);
create index missions_runnable_idx on missions (state) where state in ('queued','running','retrying','verifying');

create table mission_steps (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  user_id text not null,
  idx int not null,
  purpose text not null check (char_length(purpose) <= 300),
  operator text not null,
  tool text not null,
  state text not null default 'ready' check (state in (
    'ready', 'running', 'awaiting_input', 'awaiting_approval', 'retrying',
    'verifying', 'completed', 'failed', 'vetoed', 'skipped', 'canceled'
  )),
  -- idx values this step waits for (empty = can start immediately)
  depends_on jsonb not null default '[]',
  input jsonb not null default '{}',
  output jsonb,
  -- plain-language source references [{name, detail, simulated}]
  sources jsonb not null default '[]',
  -- approval card gating this step, when consequential
  action_id uuid,
  retry_count int not null default 0,
  max_retries int not null default 2,
  error text,
  -- post-execution verification result {ok, detail, simulated?}
  verification jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, idx)
);
create index mission_steps_mission_idx on mission_steps (mission_id, idx);
create index mission_steps_user_idx on mission_steps (user_id);

alter table missions enable row level security;
alter table mission_steps enable row level security;

revoke all on missions from authenticated, anon;
grant select on missions to authenticated;
create policy missions_self on missions
  for select using (user_id = auth_uid());

revoke all on mission_steps from authenticated, anon;
grant select on mission_steps to authenticated;
create policy mission_steps_self on mission_steps
  for select using (user_id = auth_uid());

-- ============================================================
-- 0013_browser_and_leases.sql
-- ============================================================
-- cosigno · browser operator + tick concurrency + mission budget
--
-- Adds durable browser sessions/actions (an isolated external browser service
-- does the driving; we store only a provider reference + sanitized state),
-- a per-mission execution lease so two ticks never run the same step, and a
-- per-mission cost budget the engine enforces. Browser sessions are never
-- shared across users/workspaces.

-- Tick concurrency: a short lease the engine claims before advancing a mission.
alter table missions add column lease_owner text;
alter table missions add column lease_expires_at timestamptz;
-- Cost/resource controls, counted as work happens.
alter table missions add column tool_calls int not null default 0;
alter table missions add column browser_actions int not null default 0;
alter table missions add column budget_cents int not null default 200;

create table browser_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mission_id uuid not null references missions (id) on delete cascade,
  operator text not null,
  provider text not null,
  simulated boolean not null default true,
  status text not null default 'requested' check (status in (
    'requested','starting','active','waiting_for_page','waiting_for_user_login',
    'waiting_for_approval','navigating','extracting','interacting','downloading',
    'verifying','paused','expired','blocked','failed_safely','stopped','completed'
  )),
  objective text not null check (char_length(objective) <= 300),
  current_url text,
  page_title text,
  -- opaque external-provider session reference; NEVER credentials
  provider_ref text,
  last_action text,
  stop_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index browser_sessions_mission_idx on browser_sessions (mission_id);
create index browser_sessions_user_idx on browser_sessions (user_id);

create table browser_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references browser_sessions (id) on delete cascade,
  mission_id uuid not null references missions (id) on delete cascade,
  user_id text not null,
  idx int not null,
  purpose text not null check (char_length(purpose) <= 300),
  kind text not null,
  target text,
  risk text not null default 'read' check (risk in ('read','consequential')),
  changes_external boolean not null default false,
  requires_approval boolean not null default false,
  -- approval card gating a consequential action, when required
  action_id uuid,
  state text not null default 'proposed' check (state in (
    'proposed','ready','running','awaiting_approval','submitted','completed','failed','skipped','canceled','verifying'
  )),
  -- staged form values / outcome summary / confirmation — sanitized, no secrets
  detail jsonb not null default '{}',
  verification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index browser_actions_session_idx on browser_actions (session_id, idx);
create index browser_actions_user_idx on browser_actions (user_id);

alter table browser_sessions enable row level security;
alter table browser_actions enable row level security;

revoke all on browser_sessions from authenticated, anon;
grant select on browser_sessions to authenticated;
create policy browser_sessions_self on browser_sessions
  for select using (user_id = auth_uid());

revoke all on browser_actions from authenticated, anon;
grant select on browser_actions to authenticated;
create policy browser_actions_self on browser_actions
  for select using (user_id = auth_uid());

-- ============================================================
-- 0014_mission_sources.sql
-- ============================================================
-- cosigno · mission sources (uploaded files + attached links)
--
-- The real context a user gives a mission from the dashboard: an uploaded
-- file (its extracted text summary — never the raw bytes) or an attached
-- link (its safely-read title + text). Sources are STAGED first
-- (mission_id null) while the user assembles the ask, then ATTACHED to the
-- mission when it starts. Content is UNTRUSTED: it's data the compiler reads,
-- never instructions — the injection flag records when a source tried to
-- steer the agent. Workspace-scoped by RLS; the raw file is not persisted
-- (extraction happens once at upload).

create table mission_sources (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  -- null while staged in the ask box; set when the mission is created
  mission_id uuid references missions (id) on delete cascade,
  kind text not null check (kind in ('file', 'link')),
  -- filename (file) or page title (link)
  name text not null check (char_length(name) <= 300),
  -- mime type (file) or domain (link)
  subtype text not null default '',
  size_bytes int not null default 0,
  status text not null check (status in (
    'uploading', 'processing', 'ready', 'failed', 'unsupported',
    'checking', 'reading', 'login_required', 'blocked', 'could_not_access'
  )),
  -- extracted, bounded text summary the compiler + mission read (untrusted)
  summary text not null default '' check (char_length(summary) <= 40000),
  -- true when the extracted content tried to direct the agent
  injection_flag boolean not null default false,
  -- non-secret detail: url, dimensions, page count, error note, etc.
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mission_sources_user_idx on mission_sources (user_id, created_at desc);
create index mission_sources_mission_idx on mission_sources (mission_id);
-- staged (unattached) sources for the ask box
create index mission_sources_staged_idx on mission_sources (user_id) where mission_id is null;

alter table mission_sources enable row level security;
revoke all on mission_sources from authenticated, anon;
grant select on mission_sources to authenticated;
create policy mission_sources_self on mission_sources
  for select using (user_id = auth_uid());

-- ============================================================
-- 0015_browser_products.sql
-- ============================================================
-- cosigno · browser operator MVP — real product findings + page preview
--
-- browser_products stores what the operator ACTUALLY found on a page during
-- research: only fields present on the page are set, everything else is null
-- (missing data is never invented). Rows are workspace-scoped by RLS and are
-- untrusted page data — the injection flag records when a page tried to steer
-- the agent; it is never obeyed.
--
-- browser_sessions gains screenshot_ref: a bounded JPEG data URI of the
-- current page (or a labeled sandbox placeholder), shown on the browser view.

alter table browser_sessions add column screenshot_ref text;

create table browser_products (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mission_id uuid not null references missions (id) on delete cascade,
  session_id uuid not null references browser_sessions (id) on delete cascade,
  name text not null check (char_length(name) <= 300),
  brand text not null default '',
  current_price numeric,
  currency text not null default 'USD',
  retailer text not null default '',
  product_url text not null check (char_length(product_url) <= 2048),
  processor text,
  memory text,
  storage text,
  display text,
  graphics text,
  battery_claim text,
  availability text,
  warranty text,
  return_policy text,
  source_title text not null default '',
  injection_flag boolean not null default false,
  simulated boolean not null default true,
  accessed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index browser_products_mission_idx on browser_products (mission_id, created_at);
create index browser_products_user_idx on browser_products (user_id);

alter table browser_products enable row level security;
revoke all on browser_products from authenticated, anon;
grant select on browser_products to authenticated;
create policy browser_products_self on browser_products
  for select using (user_id = auth_uid());

-- ============================================================
-- 0016_autopilot.sql
-- ============================================================
-- cosigno · business autopilot
--
-- Autopilot watches the business and detects signals; the engine recomputes
-- them from data on every read, so the only persistence is the USER's side
-- of the story: their disposition on each signal (ignored / actioned) and
-- when they last opened Autopilot (drives the "what changed since you last
-- looked" framing). Automations additionally gain an explicit mode:
--   monitor  — watch and report only (tier-2+ proposals are auto-vetoed)
--   prepare  — propose action cards that wait for approval (the default)
--   execute  — a per-automation grant: routine tier-2 proposals from this
--              rule's runs are approved automatically. Tier-3 stays manual.

alter table automations
  add column mode text not null default 'prepare'
    check (mode in ('monitor', 'prepare', 'execute'));

-- The user's disposition on a detected signal, keyed by the engine's stable
-- signal key. Rows are created "new" the first time a signal is detected.
create table autopilot_signal_states (
  user_id text not null,
  signal_key text not null,
  status text not null default 'new'
    check (status in ('new', 'seen', 'ignored', 'actioned')),
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, signal_key)
);

-- One row per user: when they last opened the Autopilot page.
create table autopilot_meta (
  user_id text primary key,
  viewed_at timestamptz not null default now()
);

-- RLS: users read their own; ALL writes go through the service role.
alter table autopilot_signal_states enable row level security;
alter table autopilot_meta enable row level security;

revoke all on autopilot_signal_states from authenticated, anon;
grant select on autopilot_signal_states to authenticated;
create policy autopilot_signal_states_self on autopilot_signal_states
  for select using (user_id = auth_uid());

revoke all on autopilot_meta from authenticated, anon;
grant select on autopilot_meta to authenticated;
create policy autopilot_meta_self on autopilot_meta
  for select using (user_id = auth_uid());

-- ============================================================
-- 0017_sign.sql
-- ============================================================
-- cosigno · cosigno sign
--
-- The saved visual signature backing the Hold-to-Sign convenience. One row
-- per user: a display name plus a small PNG data URI of the drawn signature
-- (size-bounded at the API layer). The signature is a product interaction
-- representing approval inside cosigno — NOT automatically a legally binding
-- e-signature. The underlying proof of every authorization is the hashed
-- record written into action_events at approval time (no schema change
-- needed there: events already carry a jsonb detail column).

create table signatures (
  user_id text primary key,
  name text not null,
  image text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: users read their own; ALL writes go through the service role.
alter table signatures enable row level security;

revoke all on signatures from authenticated, anon;
grant select on signatures to authenticated;
create policy signatures_self on signatures
  for select using (user_id = auth_uid());

-- ============================================================
-- 0018_temporary_authority.sql
-- ============================================================
-- cosigno · temporary authority
--
-- A scoped, time-limited authority grant: "for the next two hours, handle
-- <category> without asking." Enforced at proposal time by resolveTier —
-- only unpinned tier-2 categories that don't require SIGN are eligible (the
-- API validates; the resolver re-checks). Base tier settings are never
-- touched: when the grant expires or is revoked, the previous permission
-- level simply applies again. Every grant and revocation is audited.

create table temporary_authority (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  category text not null,
  tier int not null default 1 check (tier = 1),
  expires_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index temporary_authority_user_idx on temporary_authority (user_id, created_at desc);
-- the resolver's hot path: live grants for a user
create index temporary_authority_live_idx on temporary_authority (user_id, expires_at)
  where revoked_at is null;

-- RLS: users read their own; ALL writes go through the service role.
alter table temporary_authority enable row level security;

revoke all on temporary_authority from authenticated, anon;
grant select on temporary_authority to authenticated;
create policy temporary_authority_self on temporary_authority
  for select using (user_id = auth_uid());

-- ============================================================
-- 0019_objectives_hold.sql
-- ============================================================
-- cosigno · objectives + cosigno hold
--
-- OBJECTIVES: the layer above Delegations — an outcome the user owns over
-- time. Delegations (sessions) link to an objective; all progress is DERIVED
-- from the real state of those delegations, never stored. The user gives the
-- destination; cosigno continuously helps move toward it.
--
-- COSIGNO HOLD: a user-level authority brake, enforced in the engine before
-- any execution. One row per user (or none = not held). Base permissions are
-- never changed — resuming restores exactly the prior behavior.

create table objectives (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  target_date date,
  status text not null default 'active'
    check (status in ('active', 'achieved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index objectives_user_idx on objectives (user_id, created_at desc);

create table objective_links (
  objective_id uuid not null references objectives (id) on delete cascade,
  session_id uuid not null,
  user_id text not null,                    -- denormalized for RLS
  created_at timestamptz not null default now(),
  primary key (objective_id, session_id)
);
create index objective_links_user_idx on objective_links (user_id);
create index objective_links_session_idx on objective_links (session_id);

create table user_hold (
  user_id text primary key,
  scope text not null default 'none'
    check (scope in ('none', 'external', 'all')),
  updated_at timestamptz not null default now()
);

-- RLS: users read their own; ALL writes go through the service role.
alter table objectives enable row level security;
alter table objective_links enable row level security;
alter table user_hold enable row level security;

revoke all on objectives from authenticated, anon;
grant select on objectives to authenticated;
create policy objectives_self on objectives
  for select using (user_id = auth_uid());

revoke all on objective_links from authenticated, anon;
grant select on objective_links to authenticated;
create policy objective_links_self on objective_links
  for select using (user_id = auth_uid());

revoke all on user_hold from authenticated, anon;
grant select on user_hold to authenticated;
create policy user_hold_self on user_hold
  for select using (user_id = auth_uid());

-- ============================================================
-- 0020_permission_rules.sql
-- ============================================================
-- cosigno · custom permission rules
--
-- A user's standing policy over what cosigno may do across their connected
-- tools, written in plain language and stored as a VISIBLE, EDITABLE structured
-- constraint. The natural-language `text` is kept verbatim; the structured
-- columns are derived deterministically (see src/lib/rules.ts).
--
-- The hard guarantee lives in the app, not the schema: a rule can only ever
-- make an action MORE restrictive (raise its approval level, or forbid it). It
-- can never lower a boundary. Enforcement happens at the single connector
-- Boundary door (proposeConnectorAction), which only tightens the tier or
-- blocks — it never weakens the server's floor.

create table permission_rules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  text text not null,                       -- original natural language, verbatim
  target text not null default 'any',       -- integration key / category / 'any'
  verb text not null default 'any',         -- action verb / 'any'
  condition jsonb not null default '{"kind":"none"}'::jsonb,
  requirement text not null default 'approve'
    check (requirement in ('auto', 'approve', 'sign', 'never')),
  confidence text not null default 'high'
    check (confidence in ('high', 'low')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index permission_rules_user_idx on permission_rules (user_id, created_at desc);

-- RLS: users read their own; ALL writes go through the service role.
alter table permission_rules enable row level security;

revoke all on permission_rules from authenticated, anon;
grant select on permission_rules to authenticated;
create policy permission_rules_self on permission_rules
  for select using (user_id = auth_uid());

