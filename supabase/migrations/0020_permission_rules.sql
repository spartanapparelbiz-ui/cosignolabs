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
