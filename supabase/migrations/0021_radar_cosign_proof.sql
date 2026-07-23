-- cosigno · Radar → CoSign → Proof + webhook idempotency
--
-- Adds:
--   * receipts               — immutable Proof Receipts for every attempted
--                              external action (update-blocked by trigger).
--   * security_events        — durable, user-visible security event log.
--   * radar_states           — user dispositions on Radar items (dismiss /
--                              snooze / prepared). Radar itself never executes.
--   * cosign_rooms           — multi-approver gates over an action card,
--     cosign_room_approvers    approvals bound to the exact plan hash,
--     cosign_room_events       with a complete append-only audit history.
--   * webhook_events         — processed Stripe event ids (replay/dedup guard).
--   * subscriptions.last_event_at — out-of-order webhook guard.
--   * missions.fork_key      — Mission Fork provenance.
--
-- Security model (identical to the rest of the schema): RLS enabled on every
-- table; client roles are SELECT-only on their own rows (or have no access at
-- all for admin tables); every write flows through server routes using the
-- service role. Client write grants were globally revoked in 0002 and default
-- privileges grant future tables nothing — restated per-table here anyway.
--
-- Reversibility: this migration is purely additive (no drops, no rewrites of
-- existing data). The full down-migration is included, commented, at the end.

-- ---------------------------------------------------------------- receipts
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  correlation_id text not null,
  action_id uuid,
  mission_id uuid,
  plan_hash text not null,
  plan_version integer,
  approved_by text not null,
  authorization_method text not null,
  category text not null,
  integration text not null default 'internal',
  operation text not null,
  status text not null check (status in ('executed', 'failed', 'rejected')),
  result_summary text,
  verification jsonb,
  failure_reason text,
  undo_available boolean not null default false,
  undo_hint text,
  external_ref text,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index receipts_user_idx on receipts (user_id, created_at desc);
create index receipts_action_idx on receipts (action_id);

alter table receipts enable row level security;
revoke all on receipts from authenticated, anon;
grant select on receipts to authenticated;
create policy receipts_self on receipts for select using (user_id = auth_uid());

-- Immutability: receipts are append-only for EVERY role, service role
-- included. (Deletes remain possible solely for account deletion, which
-- removes all of a user's rows; clients have no delete grant at all.)
create or replace function receipts_block_update() returns trigger
language plpgsql as $$
begin
  raise exception 'receipts are immutable';
end
$$;
create trigger receipts_no_update
  before update on receipts
  for each row execute function receipts_block_update();

-- --------------------------------------------------------- security_events
create table security_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event text not null,
  severity text not null default 'info'
    check (severity in ('info', 'notice', 'warning', 'critical')),
  correlation_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_user_idx on security_events (user_id, created_at desc);

alter table security_events enable row level security;
revoke all on security_events from authenticated, anon;
grant select on security_events to authenticated;
create policy security_events_self on security_events
  for select using (user_id = auth_uid());

-- ------------------------------------------------------------ radar_states
create table radar_states (
  user_id text not null,
  item_key text not null,
  status text not null default 'new'
    check (status in ('new', 'seen', 'dismissed', 'snoozed', 'prepared')),
  snoozed_until timestamptz,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

alter table radar_states enable row level security;
revoke all on radar_states from authenticated, anon;
grant select on radar_states to authenticated;
create policy radar_states_self on radar_states
  for select using (user_id = auth_uid());

-- ------------------------------------------------------------ cosign rooms
create table cosign_rooms (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action_id uuid not null references actions (id) on delete cascade,
  mission_id uuid,
  name text not null default 'Approval room',
  require_all boolean not null default true,
  ordered boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'satisfied', 'changes_requested', 'expired', 'revoked', 'cancelled')),
  plan_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cosign_rooms_action_idx on cosign_rooms (action_id);
create index cosign_rooms_user_idx on cosign_rooms (user_id, created_at desc);

alter table cosign_rooms enable row level security;
revoke all on cosign_rooms from authenticated, anon;
grant select on cosign_rooms to authenticated;
create policy cosign_rooms_self on cosign_rooms
  for select using (user_id = auth_uid());

create table cosign_room_approvers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cosign_rooms (id) on delete cascade,
  user_id text not null,
  approver_email text not null,
  approver_user_id text,
  position integer not null default 0,
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected', 'changes_requested')),
  decided_plan_hash text,
  comment text,
  decided_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, approver_email)
);
create index cosign_room_approvers_room_idx on cosign_room_approvers (room_id, position);

alter table cosign_room_approvers enable row level security;
revoke all on cosign_room_approvers from authenticated, anon;
grant select on cosign_room_approvers to authenticated;
create policy cosign_room_approvers_self on cosign_room_approvers
  for select using (user_id = auth_uid());

create table cosign_room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cosign_rooms (id) on delete cascade,
  user_id text not null,
  actor_email text not null,
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index cosign_room_events_room_idx on cosign_room_events (room_id, created_at);

alter table cosign_room_events enable row level security;
revoke all on cosign_room_events from authenticated, anon;
grant select on cosign_room_events to authenticated;
create policy cosign_room_events_self on cosign_room_events
  for select using (user_id = auth_uid());

-- Room audit history is append-only for every role.
create or replace function cosign_room_events_block_update() returns trigger
language plpgsql as $$
begin
  raise exception 'cosign_room_events are immutable';
end
$$;
create trigger cosign_room_events_no_update
  before update on cosign_room_events
  for each row execute function cosign_room_events_block_update();

-- ---------------------------------------------------------- webhook_events
-- Processed Stripe event ids. INSERT ... ON CONFLICT DO NOTHING is the
-- atomic replay/dedup gate. Admin table: no client policies at all.
create table webhook_events (
  id text primary key,
  type text not null,
  created bigint not null,
  processed_at timestamptz not null default now()
);
alter table webhook_events enable row level security;
revoke all on webhook_events from authenticated, anon;

-- --------------------------------------------------------- column additions
alter table subscriptions add column last_event_at bigint;
alter table missions add column fork_key text;

-- ---------------------------------------------------------------------------
-- DOWN MIGRATION (manual; run only to roll this change back):
--
--   drop trigger if exists cosign_room_events_no_update on cosign_room_events;
--   drop function if exists cosign_room_events_block_update();
--   drop trigger if exists receipts_no_update on receipts;
--   drop function if exists receipts_block_update();
--   drop table if exists cosign_room_events;
--   drop table if exists cosign_room_approvers;
--   drop table if exists cosign_rooms;
--   drop table if exists radar_states;
--   drop table if exists security_events;
--   drop table if exists receipts;
--   drop table if exists webhook_events;
--   alter table subscriptions drop column if exists last_event_at;
--   alter table missions drop column if exists fork_key;
-- ---------------------------------------------------------------------------
