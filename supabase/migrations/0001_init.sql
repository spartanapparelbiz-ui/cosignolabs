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
