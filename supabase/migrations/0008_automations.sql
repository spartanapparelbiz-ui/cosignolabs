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
