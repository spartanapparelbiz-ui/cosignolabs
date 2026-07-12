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
