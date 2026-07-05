-- cosigno · billing
--
-- Subscription state written EXCLUSIVELY by the Stripe webhook (service
-- role). Clients may read only their own row; they have no insert/update/
-- delete path — plan enforcement never trusts the client.

create table subscriptions (
  user_id text primary key,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free',
  interval text,
  status text not null default 'active',
  current_period_end bigint,
  cancel_at_period_end boolean not null default false,
  past_due_since bigint,
  updated_at timestamptz not null default now()
);
create index subscriptions_customer_idx on subscriptions (stripe_customer_id);

alter table subscriptions enable row level security;

-- Read-your-own only. No write policies at all → service role is the only
-- writer (the webhook). Belt-and-braces: revoke client write grants.
create policy subscriptions_self on subscriptions
  for select using (user_id = auth_uid());

revoke insert, update, delete on subscriptions from authenticated, anon;
grant select on subscriptions to authenticated;
