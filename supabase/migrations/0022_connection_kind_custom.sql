-- cosigno · allow the third connection kind
--
-- THE BUG: `connections.kind` was constrained to ('app', 'mcp') in
-- 0007_connections.sql, but a third kind — 'custom', a user-added API tool —
-- shipped later and is written by /api/connections/custom. Every attempt to
-- add a custom API tool therefore fails against Postgres with a check
-- constraint violation, and has since custom tools were introduced.
--
-- It was invisible in development because the in-memory store has no
-- constraints: the same code path succeeds locally and fails in production,
-- which is the worst shape a bug can have.
--
-- Re-runnable: drops the constraint by name if present, then adds the full
-- set back. Safe on a database that was already fixed by hand.

alter table connections drop constraint if exists connections_kind_check;

alter table connections
  add constraint connections_kind_check
  check (kind in ('app', 'mcp', 'custom'));
