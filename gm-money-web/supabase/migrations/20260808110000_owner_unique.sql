-- Audit finding L3: /setup's completeFirstTimeSetup() does a plain
-- check-then-insert for the first owner account. The check (getAppUserCount
-- must be 0) and the create are two separate queries, so two overlapping
-- /setup submissions could both pass the count check before either inserts,
-- creating two owner accounts for the business. Single-tenant app with a
-- narrow window (only exploitable before any account exists), but the fix
-- is cheap: enforce at most one owner per business in the database itself.
-- The application-level count check stays (it drives setup gating), this
-- partial unique index just makes the second concurrent insert fail.
--
-- SCHEMA CHANGE: requires review before applying to production. Run the
-- SELECT below first against the real database to confirm no business
-- already has more than one owner row (a pre-existing violation would make
-- the CREATE INDEX fail). New constraint, nothing destructive, but it's
-- live data.
--
-- ============================================================
-- Preview: any business already with more than one owner row?
-- ============================================================
-- select business_id, count(*)
-- from gm_money.app_users
-- where role = 'owner' and is_active = true
-- group by business_id
-- having count(*) > 1;

create unique index if not exists app_users_one_owner_per_business_uidx
  on gm_money.app_users (business_id)
  where role = 'owner' and is_active = true;