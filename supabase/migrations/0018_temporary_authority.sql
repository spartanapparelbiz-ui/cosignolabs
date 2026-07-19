-- cosigno · temporary authority
--
-- A scoped, time-limited authority grant: "for the next two hours, handle
-- <category> without asking." Enforced at proposal time by resolveTier —
-- only unpinned tier-2 categories that don't require SIGN are eligible (the
-- API validates; the resolver re-checks). Base tier settings are never
-- touched: when the grant expires or is revoked, the previous permission
-- level simply applies again. Every grant and revocation is audited.

create table temporary_authority (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  category text not null,
  tier int not null default 1 check (tier = 1),
  expires_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index temporary_authority_user_idx on temporary_authority (user_id, created_at desc);
-- the resolver's hot path: live grants for a user
create index temporary_authority_live_idx on temporary_authority (user_id, expires_at)
  where revoked_at is null;

-- RLS: users read their own; ALL writes go through the service role.
alter table temporary_authority enable row level security;

revoke all on temporary_authority from authenticated, anon;
grant select on temporary_authority to authenticated;
create policy temporary_authority_self on temporary_authority
  for select using (user_id = auth_uid());
