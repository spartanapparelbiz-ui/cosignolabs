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
