-- cosigno · connections, rebuilt around MCP
--
-- The connection model used to be "seven hand-written OAuth connectors, plus a
-- custom-MCP escape hatch". It is now "any MCP server, plus native adapters for
-- the vendors that don't publish one yet". Three schema changes carry that:
--
--   1. auth_type gains 'mcp_local' — a server configured as a local process
--      (stdio). cosigno is a hosted service and cannot reach a process on
--      someone's laptop, so these are stored and shown honestly rather than
--      rejected at paste time. They become runnable when the local bridge does.
--
--   2. status gains 'pending' — configured, valid, not yet reachable. Without
--      it a local-process connection has to masquerade as 'error', which reads
--      as "you did something wrong" for a config that is perfectly correct.
--
--   3. mcp_tools gains its classification. Every discovered tool is sorted into
--      one of nine categories (read/search/create/update/delete/send/payment/
--      admin/execute) which the server maps to an approval tier. `confidence`
--      records how sure the classifier was, and `classified_by` records whether
--      a human settled it — so a tool the user categorised themselves is never
--      silently re-guessed on the next re-discovery.
--
-- Re-runnable: constraints are dropped by name before being re-added, and every
-- column add is `if not exists`.

alter table connections drop constraint if exists connections_auth_type_check;

alter table connections
  add constraint connections_auth_type_check
  check (auth_type in ('oauth2', 'apikey', 'mcp_remote', 'mcp_local'));

alter table connections drop constraint if exists connections_status_check;

alter table connections
  add constraint connections_status_check
  check (status in ('connected', 'needs_reauth', 'error', 'revoked', 'pending'));

-- The classifier's verdict, and who owns it.
alter table mcp_tools add column if not exists category text;
alter table mcp_tools add column if not exists confidence real;
alter table mcp_tools add column if not exists classified_by text;

alter table mcp_tools drop constraint if exists mcp_tools_category_check;

alter table mcp_tools
  add constraint mcp_tools_category_check
  check (
    category is null
    or category in (
      'read', 'search', 'create', 'update',
      'delete', 'send', 'payment', 'admin', 'execute'
    )
  );

alter table mcp_tools drop constraint if exists mcp_tools_classified_by_check;

alter table mcp_tools
  add constraint mcp_tools_classified_by_check
  check (classified_by is null or classified_by in ('auto', 'user'));

-- Tools awaiting a human decision are the Connections screen's only real
-- queue; index the lookup so the badge count is cheap on every page load.
create index if not exists mcp_tools_review_idx
  on mcp_tools (user_id)
  where classified_by = 'auto' and confidence is not null and confidence < 0.45;
