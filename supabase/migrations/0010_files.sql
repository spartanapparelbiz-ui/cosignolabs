-- cosigno · files (mission-aware, text-based v1)
--
-- Text deliverables and user documents: notes, markdown, CSV. Content lives
-- in-row (bounded 80k chars ≈ the API body cap) — binary files are a later
-- phase (needs a storage bucket decision). Optionally linked to the mission
-- (session) that produced them. Edits bump `version`.

create table files (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id uuid,                     -- the mission this belongs to, if any
  name text not null check (char_length(name) <= 120),
  mime text not null check (mime in ('text/plain', 'text/markdown', 'text/csv')),
  content text not null check (char_length(content) <= 80000),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index files_user_idx on files (user_id, updated_at desc);
create index files_session_idx on files (session_id);

alter table files enable row level security;
revoke all on files from authenticated, anon;
grant select on files to authenticated;
create policy files_self on files
  for select using (user_id = auth_uid());
