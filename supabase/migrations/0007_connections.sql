-- cosigno · integrations v2 (connections, custom MCP, OAuth state)
--
-- Supersedes the boolean `integrations` table (kept for back-compat). A
-- connection is a per-user link to a third-party app or a custom MCP server.
--
-- Security model (consistent with the rest of the schema):
--   * RLS on every table; a client may READ only its own rows.
--   * encrypted_credentials is NEVER exposed to clients — it's revoked from
--     the authenticated role's column grants, and the app reads/writes it
--     only through the service role in server routes.
--   * All writes flow through server routes using the service role.

create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider_key text not null,                 -- provider key, or 'mcp'
  kind text not null check (kind in ('app', 'mcp')),
  display_name text not null,
  status text not null default 'connected'
    check (status in ('connected', 'needs_reauth', 'error', 'revoked')),
  auth_type text not null check (auth_type in ('oauth2', 'apikey', 'mcp_remote')),
  encrypted_credentials text,                 -- AES-256-GCM blob, service-role only
  scopes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_health_at timestamptz
);
create index connections_user_idx on connections (user_id, created_at desc);

create table mcp_tools (
  connection_id uuid not null references connections (id) on delete cascade,
  user_id text not null,                      -- denormalized for RLS
  name text not null,
  description text not null default '',
  input_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,     -- off until the user opts in
  sensitive boolean not null default false,
  consented_at timestamptz,                   -- required before a sensitive tool runs
  primary key (connection_id, name)
);
create index mcp_tools_user_idx on mcp_tools (user_id);

-- Short-lived OAuth authorization state (CSRF + PKCE verifier). Rows are
-- consumed once on callback and expire; a sweep can delete stale rows.
create table oauth_states (
  state text primary key,
  user_id text not null,
  provider_key text not null,
  code_verifier text,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index oauth_states_expiry_idx on oauth_states (expires_at);

alter table connections enable row level security;
alter table mcp_tools   enable row level security;
alter table oauth_states enable row level security;

-- Clients may read their own connection rows, but NOT the secret column.
revoke all on connections from authenticated, anon;
grant select
  (id, user_id, provider_key, kind, display_name, status, auth_type,
   scopes, metadata, created_at, updated_at, last_health_at)
  on connections to authenticated;
create policy connections_self on connections
  for select using (user_id = auth_uid());

grant select on mcp_tools to authenticated;
create policy mcp_tools_self on mcp_tools
  for select using (user_id = auth_uid());

-- oauth_states is service-role only (transient secrets); no client access.
revoke all on oauth_states from authenticated, anon;

-- All writes to these tables happen via the service role; block client writes.
revoke insert, update, delete on connections from authenticated, anon;
revoke insert, update, delete on mcp_tools  from authenticated, anon;
