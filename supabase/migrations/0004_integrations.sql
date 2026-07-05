-- cosigno · integration connections
--
-- Tracks which integrations a user has connected, so the plan's integration
-- limit can be enforced server-side on connect. Writes go through the server
-- route (service role); clients read their own rows only.

create table integrations (
  user_id text not null,
  key text not null,
  connected_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table integrations enable row level security;

create policy integrations_self on integrations
  for select using (user_id = auth_uid());

revoke insert, update, delete on integrations from authenticated, anon;
grant select on integrations to authenticated;
