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
