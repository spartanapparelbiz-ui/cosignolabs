-- Perf indexes for the aggregate/count paths introduced by the speed pass.
-- Both additive and idempotent; nothing is dropped or rewritten.

-- /api/actions/summary counts executed-since-midnight per user, and any
-- status-filtered listing sorts by recency: (user_id, status, created_at)
-- lets Postgres answer both from the index instead of filtering the user's
-- whole action history.
create index if not exists actions_status_created_idx
  on actions (user_id, status, created_at desc);

-- The security cockpit counts injection-flagged actions. Flags are rare, so
-- a partial index keeps that count O(flagged rows) — effectively instant —
-- instead of a scan across every action the user ever ran.
create index if not exists actions_injection_flag_idx
  on actions (user_id) where injection_flag;
