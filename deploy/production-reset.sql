-- Gathering Moss Financial Center — Production Reset & Deployment
-- GENERATED FILE — do not edit directly.
-- Compatible with the Supabase Dashboard SQL Editor.
-- Replace {{PHIL_UUID}} and {{CRYSTAL_UUID}}, then run the complete file.

BEGIN;

SELECT 'GATHERING MOSS — PRODUCTION RESET STARTED' AS deployment_status;

-- ================================================================
-- PHASE: preflight
-- ================================================================
-- ================================================================
-- phase: preflight
-- Validates environment, owner UUIDs, opening balances, account state
-- before any destructive operation. Runs first in the transaction.
-- ================================================================

-- ================================================================
-- 1. Validate owner UUIDs
-- ================================================================
DO $$
DECLARE
    phil_id    uuid := '{{PHIL_UUID}}'::uuid;
    crystal_id uuid := '{{CRYSTAL_UUID}}'::uuid;
    phil_exists    boolean;
    crystal_exists boolean;
BEGIN
    -- Reject placeholder values
    IF phil_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR crystal_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR phil_id = crystal_id
    THEN
        RAISE EXCEPTION 'UUID validation failed: Phil and Crystal UUIDs must be replaced with actual auth.users UUIDs. Both must be distinct. Both must not be the zero UUID.';
    END IF;

    -- Verify both exist in auth.users
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = phil_id) INTO phil_exists;
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = crystal_id) INTO crystal_exists;

    IF NOT phil_exists THEN
        RAISE EXCEPTION 'Phil UUID % not found in auth.users.', phil_id;
    END IF;
    IF NOT crystal_exists THEN
        RAISE EXCEPTION 'Crystal UUID % not found in auth.users.', crystal_id;
    END IF;

    RAISE NOTICE 'Owner UUIDs validated: Phil=%, Crystal=%', phil_id, crystal_id;
END $$;

-- ================================================================
-- 2. Verify exactly three accounts: 1 checking, 1 savings, 1 cash, no extras
-- ================================================================
DO $$
DECLARE
    chk_count integer;
    sav_count integer;
    csh_count integer;
    total     integer;
BEGIN
    SELECT count(*) INTO chk_count FROM accounts WHERE type = 'checking';
    SELECT count(*) INTO sav_count FROM accounts WHERE type = 'savings';
    SELECT count(*) INTO csh_count FROM accounts WHERE type = 'cash';
    SELECT count(*) INTO total     FROM accounts;

    IF total != 3 THEN
        RAISE EXCEPTION 'Expected exactly 3 accounts, found %.', total;
    END IF;
    IF chk_count != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 checking account, found %.', chk_count;
    END IF;
    IF sav_count != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 savings account, found %.', sav_count;
    END IF;
    IF csh_count != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 cash account, found %.', csh_count;
    END IF;

    RAISE NOTICE 'Accounts verified: 1 checking, 1 savings, 1 cash, 3 total.';
END $$;

-- ================================================================
-- 4. Capture pre-reset state for post-verification
-- ================================================================
CREATE TEMP TABLE _pre_reset_accounts    AS SELECT * FROM accounts;
CREATE TEMP TABLE _pre_reset_categories  AS SELECT * FROM categories;
CREATE TEMP TABLE _pre_reset_subs        AS SELECT * FROM subcategories;
CREATE TEMP TABLE _pre_reset_trans_count AS SELECT count(*) AS cnt FROM transactions;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT name, type, opening_balance, current_balance FROM _pre_reset_accounts ORDER BY id LOOP
        RAISE NOTICE '  Account: % (%) opening=%, current=%', r.name, r.type, r.opening_balance, r.current_balance;
    END LOOP;
    RAISE NOTICE 'Pre-reset: % transactions, % categories, % subcategories',
        (SELECT cnt FROM _pre_reset_trans_count),
        (SELECT count(*) FROM _pre_reset_categories),
        (SELECT count(*) FROM _pre_reset_subs);
END $$;

-- ================================================================
-- PHASE: clear
-- ================================================================
-- ================================================================
-- phase: clear
-- Removes all transactional data. Runs after preflight, before migration.
-- ================================================================

SELECT 'Clearing transactional data' AS deployment_phase;

-- Order: delete dependent rows before parents
DELETE FROM transaction_attachments;
DELETE FROM transaction_splits;
DELETE FROM reconciliations;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
        EXECUTE 'DELETE FROM import_history';
    END IF;
END $$;

DELETE FROM transactions;

-- Set opening balances to NULL: "balance not yet established"
-- Each account's opening balance will be calculated atomically
-- during its first PNC import (statement_balance - net of imported txns).
UPDATE accounts SET opening_balance = NULL, current_balance = 0, updated_at = now();

DO $$
DECLARE
    t_count integer;
BEGIN
    SELECT count(*) INTO t_count FROM transactions;
    IF t_count != 0 THEN
        RAISE EXCEPTION 'FAIL: transactions not empty after clear — % rows remain', t_count;
    END IF;
    RAISE NOTICE 'Transactional data cleared. transactions=0, splits=0, attachments=0, reconciliations=0.';
END $$;

-- ================================================================
-- PHASE: migrate
-- ================================================================
-- ============================================================================
-- Gathering Moss Financial Center: Unified Schema, Owner-Only RLS & Atomic Import
-- Repeatable — safe to run multiple times. Does not touch unrelated tables.
-- ============================================================================

-- ============================================================================
-- 1. FINANCIAL CENTER MEMBERSHIP TABLE
--    SELECT: members read own row only (user_id = auth.uid()) — no recursion
--    No INSERT / UPDATE / DELETE policies (service_role / dashboard only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fc_members (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'owner',
  added_by  uuid,
  added_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fc_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own row" ON fc_members;
CREATE POLICY "Members read own row" ON fc_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- 2. SCHEMA EXTENSIONS (idempotent column additions)
--    fingerprint unique constraint is MANDATORY — aborts on existing duplicates
-- ============================================================================

DO $$
DECLARE
  dup_count integer;
  dup_report text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'fingerprint'
  ) THEN
    ALTER TABLE transactions ADD COLUMN fingerprint text;
  END IF;

  -- Audit existing duplicates. If any exist, abort with a reporting query.
  SELECT count(*) INTO dup_count FROM (
    SELECT fingerprint FROM transactions
    WHERE fingerprint IS NOT NULL
    GROUP BY fingerprint HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % duplicate fingerprint(s) exist in transactions.'
      '  Run this query to list them, resolve manually, then re-run the migration:'
      '  SELECT fingerprint, count(*) AS occurrences, array_agg(id ORDER BY id) AS transaction_ids'
      '  FROM transactions WHERE fingerprint IS NOT NULL'
      '  GROUP BY fingerprint HAVING count(*) > 1 ORDER BY fingerprint;',
      dup_count;
  END IF;

  -- Safe to add the constraint — always, whether column was just created or existed previously
  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS uq_trans_fingerprint;
  ALTER TABLE transactions ADD CONSTRAINT uq_trans_fingerprint UNIQUE (fingerprint);

  RAISE NOTICE 'Fingerprint unique constraint uq_trans_fingerprint applied successfully.';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'import_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN import_id bigint;
  END IF;
END $$;

-- Allow NULL opening_balance: "balance not yet established" state
-- NULL means the first import must provide a statement balance to calculate opening.
ALTER TABLE IF EXISTS accounts ALTER COLUMN opening_balance DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trans_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_trans_review ON transactions(review_status);
CREATE INDEX IF NOT EXISTS idx_trans_fingerprint ON transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_trans_import_id ON transactions(import_id);

-- ============================================================================
-- 3. IMPORT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_profiles (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name            text NOT NULL UNIQUE,
  institution     text,
  date_format     text DEFAULT 'YYYY-MM-DD',
  has_header      integer DEFAULT 1,
  column_mappings jsonb NOT NULL DEFAULT '{}',
  amount_format   jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_history (
  id                     bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  filename               text NOT NULL,
  file_hash              text,
  import_date            timestamptz NOT NULL DEFAULT now(),
  account_id             bigint,
  profile_id             bigint,
  total_rows             integer DEFAULT 0,
  new_count              integer DEFAULT 0,
  duplicate_count        integer DEFAULT 0,
  error_count            integer DEFAULT 0,
  review_required_count  integer DEFAULT 0,
  status                 text DEFAULT 'completed'
);

CREATE INDEX IF NOT EXISTS idx_import_history_account ON import_history(account_id);
CREATE INDEX IF NOT EXISTS idx_import_history_date ON import_history(import_date DESC);

-- ============================================================================
-- 4. FOREIGN KEYS (type-safe)
-- ============================================================================

DO $$
DECLARE
  acc_id_type text;
  imp_id_type text;
  trans_imp_type text;
BEGIN
  SELECT data_type INTO acc_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'id';
  SELECT data_type INTO imp_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_profiles' AND column_name = 'id';
  SELECT data_type INTO trans_imp_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'id';

  IF acc_id_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE import_history DROP CONSTRAINT IF EXISTS fk_import_history_account_id;
    ALTER TABLE import_history ADD CONSTRAINT fk_import_history_account_id
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
  END IF;

  IF imp_id_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE import_history DROP CONSTRAINT IF EXISTS fk_import_history_profile_id;
    ALTER TABLE import_history ADD CONSTRAINT fk_import_history_profile_id
      FOREIGN KEY (profile_id) REFERENCES import_profiles(id) ON DELETE SET NULL;
  END IF;

  IF trans_imp_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'import_id'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_import_id;
    ALTER TABLE transactions ADD CONSTRAINT fk_transactions_import_id
      FOREIGN KEY (import_id) REFERENCES import_history(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 5. ROW-LEVEL SECURITY — TO authenticated belt-and-suspenders + fc_members gate
-- ============================================================================

CREATE OR REPLACE FUNCTION fc_apply_rls(target_table text) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = target_table) THEN
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fc_create_policy(target_table text, policy_name text, operation text) RETURNS void AS $$
DECLARE
  tbl_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = target_table) INTO tbl_exists;
  IF NOT tbl_exists THEN RETURN; END IF;

  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, target_table);

  IF operation = 'SELECT' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'INSERT' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'UPDATE' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'DELETE' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  END IF;
END $$ LANGUAGE plpgsql;

-- Apply to all Financial Center tables
SELECT fc_apply_rls(t) FROM unnest(ARRAY[
  'accounts','categories','subcategories','transactions','merchant_memory',
  'scheduled_transactions','transaction_splits','transaction_attachments',
  'reconciliations','import_history','import_profiles'
]) t;

SELECT fc_create_policy(t, 'FC members can select ' || t, 'SELECT')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

SELECT fc_create_policy(t, 'FC members can insert ' || t, 'INSERT')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

SELECT fc_create_policy(t, 'FC members can update ' || t, 'UPDATE')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

SELECT fc_create_policy(t, 'FC members can delete ' || t, 'DELETE')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

-- Cleanup helper functions
DROP FUNCTION IF EXISTS fc_apply_rls(text);
DROP FUNCTION IF EXISTS fc_create_policy(text, text, text);

-- ============================================================================
-- 6. ATOMIC IMPORT RPC
--    Serializes per-account via FOR UPDATE. Uses ON CONFLICT for dedup safety.
--    Rejects null/blank/invalid fingerprints. Entire import is one transaction.
--    SECURITY INVOKER with locked-down search_path and execute-only-by-authenticated.
-- ============================================================================

CREATE OR REPLACE FUNCTION fc_import_transactions(
  p_account_id  bigint,
  p_filename    text,
  p_transactions jsonb,
  p_statement_balance numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hist_id      bigint;
  v_total_rows   integer;
  v_imported     integer := 0;
  v_duplicates   integer := 0;
  v_review       integer := 0;
  v_row          jsonb;
  v_fingerprint  text;
  v_inserted_id  bigint;
  v_review_stat  text;
  v_category_id  bigint;
  v_subcategory_id bigint;
  v_imported_net numeric := 0;
  v_opening      numeric;
  v_opening_was_null boolean := false;
  result         jsonb;
BEGIN
  v_total_rows := jsonb_array_length(p_transactions);

  IF v_total_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'import_id', null,
      'imported_count', 0,
      'duplicate_count', 0,
      'review_required_count', 0,
      'opening_established', false
    );
  END IF;

  -- 1. Lock account row and verify it exists
  PERFORM id FROM accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account % does not exist.', p_account_id;
  END IF;

  -- 2. Validate every fingerprint before writing anything
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_fingerprint := v_row ->> 'fingerprint';
    IF v_fingerprint IS NULL OR trim(v_fingerprint) = '' THEN
      RAISE EXCEPTION 'Rejected: row % has null or blank fingerprint. Every import row requires a valid fingerprint.',
        (v_row ->> 'date');
    END IF;
    IF length(v_fingerprint) < 8 THEN
      RAISE EXCEPTION 'Rejected: fingerprint "%" is too short (must be at least 8 chars).', v_fingerprint;
    END IF;
  END LOOP;

  -- 3. Create import history record
  INSERT INTO import_history (filename, account_id, total_rows, new_count, duplicate_count, status)
  VALUES (p_filename, p_account_id, v_total_rows, 0, 0, 'in_progress')
  RETURNING id INTO v_hist_id;

  -- 4. Insert each accepted transaction — ON CONFLICT is the only dedup gate
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_fingerprint := v_row ->> 'fingerprint';

    -- Determine review status and category (mutually exclusive)
    IF (v_row ->> 'confidence')::numeric >= 0.7
       AND v_row ->> 'suggested_category_id' IS NOT NULL
    THEN
      v_review_stat := 'approved';
      v_category_id := (v_row ->> 'suggested_category_id')::bigint;
      v_subcategory_id := NULLIF(v_row ->> 'suggested_subcategory_id', '')::bigint;
    ELSE
      v_review_stat := 'pending_review';
      v_category_id := NULL;
      v_subcategory_id := NULL;
    END IF;

    INSERT INTO transactions (
      account_id, date, payee, original_description, amount,
      transaction_type, category_id, subcategory_id,
      review_status, cleared_status, import_id, fingerprint
    ) VALUES (
      p_account_id,
      COALESCE(NULLIF(v_row ->> 'date', '')::date, current_date),
      (v_row ->> 'payee'),
      COALESCE(v_row ->> 'original_description', v_row ->> 'payee'),
      (v_row ->> 'amount')::numeric,
      COALESCE(v_row ->> 'transaction_type',
        CASE WHEN (v_row ->> 'amount')::numeric >= 0 THEN 'income' ELSE 'expense' END),
      v_category_id,
      v_subcategory_id,
      v_review_stat,
      'uncleared',
      v_hist_id,
      v_fingerprint
    )
    ON CONFLICT (fingerprint) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NOT NULL THEN
      v_imported := v_imported + 1;
      v_imported_net := v_imported_net + (v_row ->> 'amount')::numeric;
      IF v_review_stat = 'pending_review' THEN
        v_review := v_review + 1;
      END IF;
    ELSE
      v_duplicates := v_duplicates + 1;
    END IF;
  END LOOP;

  -- 5. Establish opening balance from statement balance on first import
  SELECT opening_balance INTO v_opening FROM accounts WHERE id = p_account_id;
  v_opening_was_null := v_opening IS NULL;
  IF v_opening_was_null AND v_imported > 0 THEN
    IF p_statement_balance IS NULL THEN
      RAISE EXCEPTION 'First import for this account: statement_balance is required to establish the opening balance. Provide the statement ending balance as of the last transaction date.';
    END IF;
    v_opening := p_statement_balance - v_imported_net;
    UPDATE accounts SET opening_balance = v_opening WHERE id = p_account_id;
  ELSIF NOT v_opening_was_null AND p_statement_balance IS NOT NULL THEN
    RAISE EXCEPTION 'Balance already established for this account. Do not supply statement_balance on subsequent imports.';
  END IF;

  -- 6. Update import history with final counts
  UPDATE import_history
  SET new_count = v_imported,
      duplicate_count = v_duplicates,
      review_required_count = v_review,
      status = 'completed'
  WHERE id = v_hist_id;

  -- 7. Recalculate account balance
  UPDATE accounts
  SET current_balance = (
    SELECT COALESCE(opening_balance, 0) + COALESCE(
      (SELECT sum(amount) FROM transactions
       WHERE account_id = p_account_id), 0
    )
  )
  WHERE id = p_account_id;

  result := jsonb_build_object(
    'success', true,
    'import_id', v_hist_id,
    'imported_count', v_imported,
    'duplicate_count', v_duplicates,
    'review_required_count', v_review
  );
  result := result || jsonb_build_object(
    'opening_established', (v_opening_was_null AND v_imported > 0),
    'established_opening_balance', (SELECT opening_balance FROM accounts WHERE id = p_account_id)
  );

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END $$;

-- Lock down the RPC: only authenticated role may execute
DO $$
BEGIN
  REVOKE ALL ON FUNCTION fc_import_transactions(bigint,text,jsonb,numeric) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION fc_import_transactions(bigint,text,jsonb,numeric) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION fc_import_transactions(bigint,text,jsonb,numeric) TO authenticated;
  END IF;
END $$;

-- ============================================================================
-- 7. DATA API PRIVILEGES
--    authenticated: minimum required for app (RLS + fc_members gates access)
--    anon / PUBLIC: no access to FC tables or sequences
-- ============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      -- Allow authenticated to use these tables (RLS gates actual row access)
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', tbl);
      -- Deny anon completely
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON %I FROM anon', tbl);
      END IF;
      -- Deny PUBLIC completely
      EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', tbl);
    END IF;
  END LOOP;

  -- Also revoke on fc_members (already has no client policies, this is belt-and-suspenders)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fc_members') THEN
    GRANT SELECT ON fc_members TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON fc_members FROM authenticated;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON fc_members FROM anon;
    END IF;
    REVOKE ALL ON fc_members FROM PUBLIC;
  END IF;

  -- Sequence usage: only FC-owned identity sequences, not every sequence in public
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ])
  LOOP
    EXECUTE format('
      DO $inner$
      DECLARE
        seq_name text;
      BEGIN
        SELECT pg_get_serial_sequence(''public.%I'', ''id'') INTO seq_name;
        IF seq_name IS NOT NULL THEN
          EXECUTE format(''GRANT USAGE ON SEQUENCE %%s TO authenticated'', seq_name);
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ''anon'') THEN
            EXECUTE format(''REVOKE ALL ON SEQUENCE %%s FROM anon'', seq_name);
          END IF;
          EXECUTE format(''REVOKE ALL ON SEQUENCE %%s FROM PUBLIC'', seq_name);
        END IF;
      END $inner$;
    ', tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 8. ENROLLMENT (run manually in Supabase Dashboard SQL Editor)
-- ============================================================================
--   INSERT INTO fc_members (user_id, role) VALUES ('<phil-uuid>', 'owner');
--   INSERT INTO fc_members (user_id, role) VALUES ('<crystal-uuid>', 'owner');

-- ============================================================================
-- 8. VERIFICATION QUERIES
-- ============================================================================
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;
--   SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;

-- ================================================================
-- PHASE: enroll
-- ================================================================
-- ================================================================
-- phase: enroll
-- Atomically enrolls both Phil and Crystal into fc_members.
-- Runs after the migration creates the fc_members table.
-- Both UUIDs were already validated in preflight.
-- ================================================================

SELECT 'Enrolling Phil and Crystal' AS deployment_phase;

INSERT INTO fc_members (user_id, role) VALUES
    ('{{PHIL_UUID}}'::uuid,    'owner'),
    ('{{CRYSTAL_UUID}}'::uuid, 'owner')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    member_count integer;
BEGIN
    SELECT count(*) INTO member_count FROM fc_members;
    IF member_count != 2 THEN
        RAISE EXCEPTION 'FAIL: expected exactly 2 fc_members rows after enrollment, found %', member_count;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{PHIL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Phil not found in fc_members after enrollment';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{CRYSTAL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Crystal not found in fc_members after enrollment';
    END IF;

    RAISE NOTICE 'Both owners enrolled in fc_members.';
END $$;

-- ================================================================
-- PHASE: verify
-- ================================================================
-- ================================================================
-- phase: verify
-- Post-deployment assertions. Must all pass before COMMIT.
-- ================================================================

SELECT 'Verifying post-deployment state' AS deployment_phase;

DO $$
DECLARE
    r record;
BEGIN
    -- 1. All transactional tables must be zero
    IF (SELECT count(*) FROM transactions) != 0 THEN
        RAISE EXCEPTION 'FAIL: % transactions remain', (SELECT count(*) FROM transactions);
    END IF;
    IF (SELECT count(*) FROM transaction_splits) != 0 THEN
        RAISE EXCEPTION 'FAIL: % splits remain', (SELECT count(*) FROM transaction_splits);
    END IF;
    IF (SELECT count(*) FROM transaction_attachments) != 0 THEN
        RAISE EXCEPTION 'FAIL: % attachments remain', (SELECT count(*) FROM transaction_attachments);
    END IF;
    IF (SELECT count(*) FROM reconciliations) != 0 THEN
        RAISE EXCEPTION 'FAIL: % reconciliations remain', (SELECT count(*) FROM reconciliations);
    END IF;
    IF (SELECT count(*) FROM import_history) != 0 THEN
        RAISE EXCEPTION 'FAIL: % import_history rows remain', (SELECT count(*) FROM import_history);
    END IF;
    RAISE NOTICE 'PASS: all transactional tables empty (transactions=0, splits=0, attachments=0, reconciliations=0, import_history=0).';

    -- 2. Zero fingerprints and import references
    IF (SELECT count(*) FROM transactions WHERE fingerprint IS NOT NULL) != 0 THEN
        RAISE EXCEPTION 'FAIL: fingerprints exist after clear';
    END IF;
    IF (SELECT count(*) FROM transactions WHERE import_id IS NOT NULL) != 0 THEN
        RAISE EXCEPTION 'FAIL: import references exist after clear';
    END IF;
    RAISE NOTICE 'PASS: zero fingerprints, zero import references.';

    -- 3. Exactly 3 accounts preserved with same IDs, names, types
    FOR r IN SELECT * FROM _pre_reset_accounts ORDER BY id LOOP
        IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = r.id AND name = r.name AND type = r.type) THEN
            RAISE EXCEPTION 'FAIL: account id=% name=% type=% was lost or altered.', r.id, r.name, r.type;
        END IF;
        IF (SELECT opening_balance FROM accounts WHERE id = r.id) IS DISTINCT FROM (SELECT opening_balance FROM _pre_reset_accounts WHERE id = r.id) THEN
            RAISE NOTICE 'INFO: account % opening balance changed from % to %', r.name, r.opening_balance, (SELECT opening_balance FROM accounts WHERE id = r.id);
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM accounts) != 3 THEN
        RAISE EXCEPTION 'FAIL: account count changed to %', (SELECT count(*) FROM accounts);
    END IF;
    RAISE NOTICE 'PASS: all 3 accounts preserved with exact IDs, names, and types.';

    -- 4. Categories and subcategories preserved
    IF (SELECT count(*) FROM categories) != (SELECT count(*) FROM _pre_reset_categories) THEN
        RAISE EXCEPTION 'FAIL: category count changed';
    END IF;
    IF (SELECT count(*) FROM subcategories) != (SELECT count(*) FROM _pre_reset_subs) THEN
        RAISE EXCEPTION 'FAIL: subcategory count changed';
    END IF;
    RAISE NOTICE 'PASS: categories (%) and subcategories (%) preserved.',
        (SELECT count(*) FROM categories), (SELECT count(*) FROM subcategories);

    -- 5. Both owners enrolled
    IF (SELECT count(*) FROM fc_members) != 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 fc_members, found %', (SELECT count(*) FROM fc_members);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{PHIL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Phil missing from fc_members';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{CRYSTAL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Crystal missing from fc_members';
    END IF;
    RAISE NOTICE 'PASS: both owners enrolled in fc_members.';

    -- 6. Opening balances are NULL (balance not yet established)
    --    Balances are set atomically during the first PNC import.
    FOR r IN SELECT name, opening_balance, current_balance FROM accounts LOOP
        IF r.opening_balance IS NOT NULL THEN
            RAISE EXCEPTION 'FAIL: % opening_balance should be NULL (balance not yet established), got %', r.name, r.opening_balance;
        END IF;
        IF r.current_balance != 0 THEN
            RAISE EXCEPTION 'FAIL: % current_balance should be 0, got %', r.name, r.current_balance;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: all accounts in balance-not-established state (opening=NULL, current=0).';

    -- 7. RLS on all FC tables
    IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true AND tablename = ANY(ARRAY[
        'accounts','categories','subcategories','transactions','merchant_memory','scheduled_transactions',
        'transaction_splits','transaction_attachments','reconciliations','import_history','import_profiles','fc_members'
    ])) < 12 THEN
        RAISE EXCEPTION 'FAIL: RLS not enabled on all FC tables';
    END IF;
    RAISE NOTICE 'PASS: RLS enabled on all FC tables.';

    -- 8. Schema artifacts present
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_trans_fingerprint') THEN
        RAISE EXCEPTION 'FAIL: fingerprint unique constraint missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
        RAISE EXCEPTION 'FAIL: import_history missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'fc_import_transactions') THEN
        RAISE EXCEPTION 'FAIL: fc_import_transactions missing';
    END IF;
    RAISE NOTICE 'PASS: fingerprint constraint, import tables, and RPC all present.';
END $$;

-- Cleanup temp tables
DROP TABLE IF EXISTS _pre_reset_accounts;
DROP TABLE IF EXISTS _pre_reset_categories;
DROP TABLE IF EXISTS _pre_reset_subs;
DROP TABLE IF EXISTS _pre_reset_trans_count;

-- The owner explicitly requires a true fresh start. The temporary database
-- recovery copy must not leave obsolete transactions behind after success.
-- If any earlier statement fails, the reset transaction rolls back and this
-- drop does not occur.
DROP SCHEMA IF EXISTS fc_backup CASCADE;
SELECT 'Temporary recovery schema removed; no obsolete transaction copy remains in this database' AS deployment_phase;

SELECT 'DEPLOYMENT VERIFIED — COMMITTING' AS deployment_status;
COMMIT;
SELECT 'DEPLOYMENT SUCCESSFUL — BOTH OWNERS ENROLLED' AS deployment_status;
