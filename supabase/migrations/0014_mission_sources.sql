-- cosigno · mission sources (uploaded files + attached links)
--
-- The real context a user gives a mission from the dashboard: an uploaded
-- file (its extracted text summary — never the raw bytes) or an attached
-- link (its safely-read title + text). Sources are STAGED first
-- (mission_id null) while the user assembles the ask, then ATTACHED to the
-- mission when it starts. Content is UNTRUSTED: it's data the compiler reads,
-- never instructions — the injection flag records when a source tried to
-- steer the agent. Workspace-scoped by RLS; the raw file is not persisted
-- (extraction happens once at upload).

create table mission_sources (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  -- null while staged in the ask box; set when the mission is created
  mission_id uuid references missions (id) on delete cascade,
  kind text not null check (kind in ('file', 'link')),
  -- filename (file) or page title (link)
  name text not null check (char_length(name) <= 300),
  -- mime type (file) or domain (link)
  subtype text not null default '',
  size_bytes int not null default 0,
  status text not null check (status in (
    'uploading', 'processing', 'ready', 'failed', 'unsupported',
    'checking', 'reading', 'login_required', 'blocked', 'could_not_access'
  )),
  -- extracted, bounded text summary the compiler + mission read (untrusted)
  summary text not null default '' check (char_length(summary) <= 40000),
  -- true when the extracted content tried to direct the agent
  injection_flag boolean not null default false,
  -- non-secret detail: url, dimensions, page count, error note, etc.
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mission_sources_user_idx on mission_sources (user_id, created_at desc);
create index mission_sources_mission_idx on mission_sources (mission_id);
-- staged (unattached) sources for the ask box
create index mission_sources_staged_idx on mission_sources (user_id) where mission_id is null;

alter table mission_sources enable row level security;
revoke all on mission_sources from authenticated, anon;
grant select on mission_sources to authenticated;
create policy mission_sources_self on mission_sources
  for select using (user_id = auth_uid());
