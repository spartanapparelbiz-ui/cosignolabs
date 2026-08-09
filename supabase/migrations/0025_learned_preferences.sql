-- cosigno · learned preferences (the mute list)
--
-- cosigno now reads its own decision history — what the user approved, what
-- they rewrote before approving, what they vetoed and why — and states the
-- pattern back to the planner as a preference. That derivation is stateless:
-- it is recounted from the `actions` and `action_events` rows on every read,
-- so there is no preferences table to go stale, to outlive the behaviour that
-- produced it, or to survive deleting the actions it was inferred from.
--
-- The single thing that must persist is disagreement. When cosigno concludes
-- something about a person that they don't accept, they need a way to switch
-- that conclusion off that does NOT require deleting real history to do it —
-- otherwise the only way to correct the operator's model of you is to destroy
-- your own audit trail.
--
-- Keys are stable and derived (`avoid:send_email`, `constraint:weekend`), so a
-- mute set today still applies to the same conclusion next month. Muting is
-- the user writing, never the agent: nothing in the planner path writes here.
--
-- Additive and idempotent; no column is dropped or rewritten.

alter table user_prefs
  add column if not exists muted_preferences text[] not null default '{}';
