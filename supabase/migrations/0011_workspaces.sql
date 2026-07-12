-- cosigno · workspaces (teams / household)
--
-- One small, honest sharing model: a user owns at most one workspace, invites
-- people by email, and members hold a role. Roles gate DELEGATED APPROVALS:
-- an owner/approver may approve or veto a workspace-mate's tier-2 (write)
-- proposals through the same engine door. Tier-3 (destructive) approvals stay
-- personal — only the action's owner can type the confirmation. The agent
-- gains no new powers from a workspace; only humans are added.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  name text not null check (char_length(name) <= 80),
  created_at timestamptz not null default now()
);
create index workspaces_owner_idx on workspaces (owner_user_id);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  -- null until the invited email signs in and the invite is accepted.
  user_id text,
  email text not null check (char_length(email) <= 200),
  role text not null default 'member' check (role in ('owner', 'approver', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index workspace_members_ws_idx on workspace_members (workspace_id);
create index workspace_members_user_idx on workspace_members (user_id);
create index workspace_members_email_idx on workspace_members (email);

alter table workspaces enable row level security;
alter table workspace_members enable row level security;

-- Members can see their workspace and its member list; all writes go through
-- the server (service role) so invites/role changes are always policy-checked.
-- The membership check lives in a SECURITY DEFINER function so the
-- workspace_members policy doesn't recurse into itself.
create or replace function is_workspace_member(ws uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws
      and user_id = auth_uid()
      and status = 'active'
  );
$$;
revoke all on function is_workspace_member(uuid) from public;
grant execute on function is_workspace_member(uuid) to authenticated;

revoke all on workspaces from authenticated, anon;
grant select on workspaces to authenticated;
create policy workspaces_member_select on workspaces
  for select using (is_workspace_member(id));

revoke all on workspace_members from authenticated, anon;
grant select on workspace_members to authenticated;
create policy workspace_members_member_select on workspace_members
  for select using (is_workspace_member(workspace_id));
