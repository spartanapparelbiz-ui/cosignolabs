-- cosigno · internal AI cost ledger
--
-- One row per AI request: model, tokens, estimated cost, who, plan, mission.
-- INTERNAL ONLY. No RLS select grant to authenticated — users never see
-- tokens or provider costs; they buy outcomes. Reads happen through the
-- service role (the admin costs endpoint) exclusively.

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mission_id uuid,
  session_id uuid,
  task text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  -- USD; null = model missing from the configured price table (unknown, not zero).
  est_cost_usd numeric,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on ai_usage (user_id, created_at desc);
create index ai_usage_mission_idx on ai_usage (mission_id) where mission_id is not null;

alter table ai_usage enable row level security;
-- Deliberately NO select policy for authenticated: this table is invisible to
-- clients. Service role bypasses RLS for the internal dashboard.
revoke all on ai_usage from authenticated, anon;
