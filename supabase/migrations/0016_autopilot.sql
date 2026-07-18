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
