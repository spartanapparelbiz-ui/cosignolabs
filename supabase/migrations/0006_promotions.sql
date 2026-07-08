-- cosigno · promotions (single-use offers) + subscription start time
--
-- One row per (user, offer) enforces "each offer is claimable exactly once
-- per customer, ever" at the database level. Written by server routes /
-- webhook only; RLS lets a user read their own rows (so the UI can hide
-- already-claimed offers) but never write them.

create table promotions (
  user_id text not null,
  offer text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, offer)
);
create index promotions_user_idx on promotions (user_id);

alter table promotions enable row level security;
create policy promotions_self on promotions
  for select using (user_id = auth_uid());
revoke insert, update, delete on promotions from authenticated, anon;
grant select on promotions to authenticated;

-- When the Stripe subscription was created — powers the 14-day refund window.
alter table subscriptions add column if not exists started_at bigint;
