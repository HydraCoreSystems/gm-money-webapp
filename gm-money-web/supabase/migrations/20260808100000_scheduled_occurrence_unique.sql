-- Audit finding L2: processDueScheduledTransactions() (lib/scheduled.ts)
-- checks for an existing (business_id, schedule_id, transaction_date) row
-- before generating a scheduled occurrence, but that check is a plain
-- select-then-insert with no database-level backstop -- the real unique
-- uniqueness on transactions is (business_id, source, source_record_id),
-- and source_record_id here is a fresh crypto.randomUUID() per insert, so
-- it can never collide. Two overlapping invocations (daily Vercel Cron +
-- an owner clicking "run now", or a cron retry) could both pass the
-- select before either inserts, producing two transactions for the same
-- schedule+due-date.
--
-- The catch-up loop's application-level check stays (it drives the loop
-- correctly), but this partial unique index makes the underlying database
-- reject a genuinely duplicated occurrence, and lib/scheduled.ts now
-- treats the unique-violation as "already created" instead of failing.
--
-- SCHEMA CHANGE: requires review before applying to production. Run the
-- SELECT below first against the real database to confirm no existing
-- rows violate the constraint-holder it will enforce (a pre-existing
-- duplicate would make the CREATE INDEX fail once any such rows exist) --
-- new constraint, nothing destructive, but it's live data.
--
-- ============================================================
-- Preview: any existing rows that would already violate the uniqueness
-- this index enforces? (returns rows only if a problem exists)
-- ============================================================
-- select business_id, schedule_id, transaction_date, count(*)
-- from gm_money.transactions
-- where schedule_id is not null
-- group by business_id, schedule_id, transaction_date
-- having count(*) > 1;

create unique index if not exists transactions_schedule_date_uidx
  on gm_money.transactions (business_id, schedule_id, transaction_date)
  where schedule_id is not null;