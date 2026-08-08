-- Login rate-limiting for /login (see audit finding M4).
--
-- Additive-only change: a small bookkeeping table tracking failed login
-- attempts per (business_id, email), so the login Server Action can cap
-- guess attempts (bcrypt cost throttles each attempt but nothing capped
-- the *number* of attempts before this). Applies in front of
-- bcrypt.compare server-side; see lib/app-users.ts / app/login/actions.ts.
--
-- SCHEMA CHANGE: requires review before applying to production (the code
-- references gm_money.login_attempts once this migration has run). Run
-- the SELECT below first against the real database to confirm the table
-- doesn't already exist with a conflicting shape before running the
-- CREATE -- new table, nothing destructive, but this is live data.
--
-- ============================================================
-- Preview: does the table already exist with an incompatible shape?
-- ============================================================
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'gm_money' and table_name = 'login_attempts'
-- order by ordinal_position;

create table if not exists gm_money.login_attempts (
  business_id uuid not null,
  email text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz null,
  updated_at timestamptz not null default now(),
  constraint login_attempts_email_lower_check check (email = lower(email)),
  primary key (business_id, email)
);