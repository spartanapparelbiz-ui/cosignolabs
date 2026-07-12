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
