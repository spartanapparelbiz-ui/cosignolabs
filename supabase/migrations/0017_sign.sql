-- cosigno · cosigno sign
--
-- The saved visual signature backing the Hold-to-Sign convenience. One row
-- per user: a display name plus a small PNG data URI of the drawn signature
-- (size-bounded at the API layer). The signature is a product interaction
-- representing approval inside cosigno — NOT automatically a legally binding
-- e-signature. The underlying proof of every authorization is the hashed
-- record written into action_events at approval time (no schema change
-- needed there: events already carry a jsonb detail column).

create table signatures (
  user_id text primary key,
  name text not null,
  image text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: users read their own; ALL writes go through the service role.
alter table signatures enable row level security;

revoke all on signatures from authenticated, anon;
grant select on signatures to authenticated;
create policy signatures_self on signatures
  for select using (user_id = auth_uid());
