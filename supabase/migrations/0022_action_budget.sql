-- cosigno · action budget
--
-- A mission's limit, stated in the unit a person actually cares about: how
-- many things cosigno may CHANGE in the outside world before it stops and
-- checks in.
--
-- The old cap was `budget_cents`, shown in the product as "budget cap $2.00".
-- That number never meant dollars to the person reading it — the engine
-- divides it by five to get a tool-call ceiling — so it asked someone to
-- reason about cosigno's hosting costs in order to answer a question about
-- their own business. `budget_cents` stays exactly as it is and keeps doing
-- that job internally; this column is the one the product shows.
--
-- Counting is deliberately narrow: reading, searching and drafting are free.
-- Only actions that leave cosigno — a sent email, a published post, an
-- updated record, a payment — spend the budget. A limit that ticked down
-- while cosigno was reading would make people set it high to avoid the
-- interruption, which is the opposite of a safety control.
--
-- Both columns are additive and idempotent; nothing is dropped or rewritten.

-- Per-mission override. NULL means "whatever the workspace default is",
-- so raising the default lifts every mission that never chose its own.
alter table missions add column if not exists action_budget int;

-- The workspace default, applied to any mission that doesn't override it.
-- 0 = unlimited (see UNLIMITED in src/lib/missions/budget.ts).
alter table user_prefs add column if not exists action_budget int not null default 25;
