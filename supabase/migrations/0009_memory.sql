-- cosigno · user-controlled memory
--
-- Short operational notes the USER saves ("i prefer replies under 100 words",
-- "my priority this month is the acme launch") that are fed to the planner as
-- explicit user context. Never invisible, never uncontrollable: full CRUD,
-- per-memory enable, and a master switch. The agent never writes memory.

create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content text not null check (char_length(content) <= 300),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_user_idx on memories (user_id, created_at desc);

create table user_prefs (
  user_id text primary key,
  memory_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table memories enable row level security;
alter table user_prefs enable row level security;

revoke all on memories from authenticated, anon;
grant select on memories to authenticated;
create policy memories_self on memories
  for select using (user_id = auth_uid());

revoke all on user_prefs from authenticated, anon;
grant select on user_prefs to authenticated;
create policy user_prefs_self on user_prefs
  for select using (user_id = auth_uid());
