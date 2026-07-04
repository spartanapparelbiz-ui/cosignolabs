-- cosigno · security hardening
--
-- Tightens the client surface to READ-ONLY. After this migration the anon /
-- authenticated roles can:
--   * SELECT their own rows (sessions, messages, actions, action_events,
--     tier_settings, usage) — that's it.
-- ALL writes (including session/message creation and proposal edits) go
-- through server routes using the service-role key. beta_applications has
-- no client policies at all: insert AND select are server-only.

-- 1. Drop every client write policy from 0001.
drop policy if exists sessions_insert       on sessions;
drop policy if exists messages_insert       on messages;
drop policy if exists actions_edit_proposed on actions;
drop policy if exists tiers_upsert          on tier_settings;
drop policy if exists tiers_update          on tier_settings;

-- 2. Belt-and-braces: revoke all write privileges from client roles on
--    every table (RLS is deny-by-default without policies, but revoking
--    the grants removes the capability entirely).
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated, anon;

-- Client roles keep SELECT only (scoped by the *_self RLS policies).
grant select on users, sessions, messages, actions, action_events,
             tier_settings, usage to authenticated;
revoke all on beta_applications from authenticated, anon;

-- Default privileges for future tables: nothing for client roles.
alter default privileges in schema public
  revoke all on tables from authenticated, anon;

-- 3. Injection containment inside the database: a flagged action can never
--    be approved or start executing, no matter which code path asks.
create or replace function enforce_action_transition() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not valid_action_transition(old.status, new.status) then
      raise exception 'invalid action status transition: % -> %', old.status, new.status;
    end if;
    if new.status in ('approved', 'executing') and old.injection_flag then
      raise exception 'injection_blocked: flagged actions cannot be approved or executed';
    end if;
  end if;
  -- injection_flag is set at proposal time and immutable afterwards.
  if new.injection_flag is distinct from old.injection_flag then
    raise exception 'injection_flag is immutable';
  end if;
  return new;
end
$$;

-- 4. Same check inside the transition RPC (the trigger fires anyway; this
--    yields the cleaner error before the UPDATE).
create or replace function transition_action(
  p_action_id uuid,
  p_user_id text,
  p_new_status action_status,
  p_result jsonb default null,
  p_veto_reason text default null,
  p_payload jsonb default null,
  p_summary text default null
) returns actions
language plpgsql security definer set search_path = public as $$
declare
  v_action actions;
begin
  select * into v_action from actions
    where id = p_action_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'action_not_found';
  end if;
  if not valid_action_transition(v_action.status, p_new_status) then
    raise exception 'invalid action status transition: % -> %', v_action.status, p_new_status;
  end if;
  if p_new_status in ('approved', 'executing') and v_action.injection_flag then
    raise exception 'injection_blocked: flagged actions cannot be approved or executed';
  end if;

  update actions set
    status      = p_new_status,
    result      = coalesce(p_result, result),
    veto_reason = coalesce(p_veto_reason, veto_reason),
    payload     = coalesce(p_payload, payload),
    summary     = coalesce(p_summary, summary),
    resolved_at = case when p_new_status in ('executed', 'failed', 'vetoed')
                       then now() else resolved_at end
  where id = p_action_id
  returning * into v_action;

  return v_action;
end
$$;
revoke all on function transition_action from public, authenticated, anon;

-- 5. RPCs are service-role-only; re-affirm for increment_usage as well.
revoke all on function increment_usage from public, authenticated, anon;
