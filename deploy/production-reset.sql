-- ============================================================================
-- Gathering Moss Financial Center — Production Reset & Deployment
-- Atomic: entire script is one transaction. Any failure rolls back everything.
-- Run in Supabase Dashboard SQL Editor.
-- 
-- Before running:
--   1. Take a JSON snapshot via the app or Dashboard export.
--   2. Confirm Phil and Crystal's auth.users UUIDs exist.
--   3. Replace <phil-uuid> and <crystal-uuid> below.
--   4. Set opening balances if they differ from current_balance (see step 7).
-- ============================================================================

BEGIN;

\echo '========================================'
\echo '  PRODUCTION RESET & DEPLOYMENT'
\echo '========================================'

-- ============================================================================
-- PHASE 1: Verify environment
-- ============================================================================
\echo ''
\echo '--- Phase 1: Verify environment ---'

DO $$
DECLARE
  checking_count integer;
  savings_count  integer;
  cash_count     integer;
  cat_count      integer;
  sub_count      integer;
BEGIN
  -- Verify we have the expected 3 accounts
  SELECT count(*) INTO checking_count FROM accounts WHERE type = 'checking';
  SELECT count(*) INTO savings_count  FROM accounts WHERE type = 'savings';
  SELECT count(*) INTO cash_count     FROM accounts WHERE type = 'cash';

  IF checking_count != 1 THEN
    RAISE EXCEPTION 'Expected 1 checking account, found %', checking_count;
  END IF;
  IF savings_count != 1 THEN
    RAISE EXCEPTION 'Expected 1 savings account, found %', savings_count;
  END IF;
  IF cash_count != 1 THEN
    RAISE EXCEPTION 'Expected 1 cash account, found %', cash_count;
  END IF;

  RAISE NOTICE 'Accounts verified: % checking, % savings, % cash', checking_count, savings_count, cash_count;

  -- Verify categories and subcategories exist
  SELECT count(*) INTO cat_count FROM categories;
  SELECT count(*) INTO sub_count FROM subcategories;
  IF cat_count < 1 THEN
    RAISE EXCEPTION 'No categories found — schema may be incomplete';
  END IF;
  RAISE NOTICE 'Categories: %, Subcategories: %', cat_count, sub_count;

  -- Record pre-reset state for verification
  RAISE NOTICE 'Pre-reset: transactions=%, splits=%, attachments=%, reconciliations=%',
    (SELECT count(*) FROM transactions),
    (SELECT count(*) FROM transaction_splits),
    (SELECT count(*) FROM transaction_attachments),
    (SELECT count(*) FROM reconciliations);
END $$;

-- ============================================================================
-- PHASE 2: Backup account configuration
-- ============================================================================
\echo ''
\echo '--- Phase 2: Capture account configuration ---'

-- Snapshot account rows to a temp table for verification after reset
CREATE TEMP TABLE _pre_deploy_accounts AS SELECT * FROM accounts;
CREATE TEMP TABLE _pre_deploy_categories AS SELECT * FROM categories;
CREATE TEMP TABLE _pre_deploy_subcategories AS SELECT * FROM subcategories;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT name, type, institution, opening_balance FROM _pre_deploy_accounts LOOP
    RAISE NOTICE '  Preserving: % (%) opening=$%', r.name, r.type, r.opening_balance;
  END LOOP;
  RAISE NOTICE 'Account configuration captured.';
END $$;

-- ============================================================================
-- PHASE 3: Clear all transactional data
-- ============================================================================
\echo ''
\echo '--- Phase 3: Clear transactional data ---'

-- Order matters: delete dependent rows before parents
DELETE FROM transaction_attachments;
DELETE FROM transaction_splits;
DELETE FROM reconciliations;

-- import_history may not exist yet (it's created by the migration below)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
    EXECUTE 'DELETE FROM import_history';
    RAISE NOTICE 'Cleared import_history.';
  ELSE
    RAISE NOTICE 'import_history does not exist yet (will be created by migration).';
  END IF;
END $$;

DELETE FROM transactions;

-- Reset account balances to opening balances (owner must set these first)
UPDATE accounts SET current_balance = opening_balance, updated_at = now();

DO $$
DECLARE
  t_count integer;
BEGIN
  SELECT count(*) INTO t_count FROM transactions;
  IF t_count != 0 THEN
    RAISE EXCEPTION 'FAIL: transactions table not empty after DELETE — % rows remain', t_count;
  END IF;
  RAISE NOTICE 'All transactional data cleared. transactions=0, splits=0, attachments=0, reconciliations=0';

  IF (SELECT count(*) FROM merchant_memory) != 0 THEN
    RAISE EXCEPTION 'merchant_memory has data that should not exist';
  END IF;
  IF (SELECT count(*) FROM scheduled_transactions) != 0 THEN
    RAISE EXCEPTION 'scheduled_transactions has data that should not exist';
  END IF;
  RAISE NOTICE 'merchant_memory=0, scheduled_transactions=0 (confirmed empty)';
END $$;

-- ============================================================================
-- PHASE 4: Apply Financial Center schema & security migration
-- ============================================================================
\echo ''
\echo '--- Phase 4: Apply FC migration ---'

-- Migration is applied inline below. Each section is idempotent.

-- 4a. fc_members table
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

-- 4b. Schema extensions
DO $$
DECLARE
  dup_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'fingerprint'
  ) THEN
    ALTER TABLE transactions ADD COLUMN fingerprint text;
  END IF;

  -- Audit duplicates before adding unique constraint
  SELECT count(*) INTO dup_count FROM (
    SELECT fingerprint FROM transactions
    WHERE fingerprint IS NOT NULL
    GROUP BY fingerprint HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % duplicate fingerprint(s) exist.', dup_count;
  END IF;

  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS uq_trans_fingerprint;
  ALTER TABLE transactions ADD CONSTRAINT uq_trans_fingerprint UNIQUE (fingerprint);
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

CREATE INDEX IF NOT EXISTS idx_trans_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_trans_review ON transactions(review_status);
CREATE INDEX IF NOT EXISTS idx_trans_fingerprint ON transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_trans_import_id ON transactions(import_id);

-- 4c. Import tables
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

-- 4d. Foreign keys
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

-- 4e. RLS policies (TO authenticated + fc_members gate)
CREATE OR REPLACE FUNCTION _fc_rls(target_table text) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = target_table) THEN
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION _fc_pol(target_table text, pname text, op text) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = target_table) THEN RETURN; END IF;
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pname, target_table);
  IF op = 'SELECT' THEN
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))', pname, target_table);
  ELSIF op = 'INSERT' THEN
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))', pname, target_table);
  ELSIF op = 'UPDATE' THEN
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))', pname, target_table);
  ELSIF op = 'DELETE' THEN
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))', pname, target_table);
  END IF;
END $$ LANGUAGE plpgsql;

SELECT _fc_rls(t) FROM unnest(ARRAY[
  'accounts','categories','subcategories','transactions','merchant_memory',
  'scheduled_transactions','transaction_splits','transaction_attachments',
  'reconciliations','import_history','import_profiles'
]) t;

SELECT _fc_pol(t, 'FC members ' || op || ' ' || t, op)
FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) op,
unnest(ARRAY[
  'accounts','categories','subcategories','transactions','merchant_memory',
  'scheduled_transactions','transaction_splits','transaction_attachments',
  'reconciliations','import_history','import_profiles'
]) t;

DROP FUNCTION IF EXISTS _fc_rls(text);
DROP FUNCTION IF EXISTS _fc_pol(text,text,text);

-- 4f. Atomic import RPC
CREATE OR REPLACE FUNCTION fc_import_transactions(
  p_account_id bigint, p_filename text, p_transactions jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $_$
DECLARE
  v_hist_id bigint; v_total_rows integer; v_imported integer := 0;
  v_duplicates integer := 0; v_review integer := 0; v_row jsonb;
  v_fingerprint text; v_inserted_id bigint; v_review_stat text;
  v_category_id bigint; v_subcategory_id bigint; result jsonb;
BEGIN
  v_total_rows := jsonb_array_length(p_transactions);
  IF v_total_rows = 0 THEN
    RETURN jsonb_build_object('success', true, 'import_id', null, 'imported_count', 0, 'duplicate_count', 0, 'review_required_count', 0);
  END IF;
  PERFORM id FROM accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account % does not exist.', p_account_id; END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_transactions) LOOP
    v_fingerprint := v_row ->> 'fingerprint';
    IF v_fingerprint IS NULL OR trim(v_fingerprint) = '' THEN
      RAISE EXCEPTION 'Rejected: row has null or blank fingerprint.';
    END IF;
    IF length(v_fingerprint) < 8 THEN
      RAISE EXCEPTION 'Rejected: fingerprint too short.';
    END IF;
  END LOOP;
  INSERT INTO import_history (filename, account_id, total_rows, new_count, duplicate_count, status)
  VALUES (p_filename, p_account_id, v_total_rows, 0, 0, 'in_progress') RETURNING id INTO v_hist_id;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_transactions) LOOP
    v_fingerprint := v_row ->> 'fingerprint';
    IF (v_row ->> 'confidence')::numeric >= 0.7 AND v_row ->> 'suggested_category_id' IS NOT NULL THEN
      v_review_stat := 'approved';
      v_category_id := (v_row ->> 'suggested_category_id')::bigint;
      v_subcategory_id := NULLIF(v_row ->> 'suggested_subcategory_id', '')::bigint;
    ELSE
      v_review_stat := 'pending_review'; v_category_id := NULL; v_subcategory_id := NULL;
    END IF;
    INSERT INTO transactions (account_id, date, payee, original_description, amount, transaction_type, category_id, subcategory_id, review_status, cleared_status, import_id, fingerprint)
    VALUES (p_account_id, COALESCE(v_row ->> 'date', current_date::text), (v_row ->> 'payee'),
      COALESCE(v_row ->> 'original_description', v_row ->> 'payee'), (v_row ->> 'amount')::numeric,
      COALESCE(v_row ->> 'transaction_type', CASE WHEN (v_row ->> 'amount')::numeric >= 0 THEN 'income' ELSE 'expense' END),
      v_category_id, v_subcategory_id, v_review_stat, 'uncleared', v_hist_id, v_fingerprint)
    ON CONFLICT (fingerprint) DO NOTHING RETURNING id INTO v_inserted_id;
    IF v_inserted_id IS NOT NULL THEN v_imported := v_imported + 1; IF v_review_stat = 'pending_review' THEN v_review := v_review + 1; END IF;
    ELSE v_duplicates := v_duplicates + 1; END IF;
  END LOOP;
  UPDATE import_history SET new_count = v_imported, duplicate_count = v_duplicates, review_required_count = v_review, status = 'completed' WHERE id = v_hist_id;
  UPDATE accounts SET current_balance = (SELECT COALESCE(opening_balance, 0) + COALESCE((SELECT sum(amount) FROM transactions WHERE account_id = p_account_id AND review_status = 'approved'), 0)) WHERE id = p_account_id;
  RETURN jsonb_build_object('success', true, 'import_id', v_hist_id, 'imported_count', v_imported, 'duplicate_count', v_duplicates, 'review_required_count', v_review);
EXCEPTION WHEN OTHERS THEN RAISE;
END $_$;

-- 4g. RPC privileges
DO $$ BEGIN
  REVOKE ALL ON FUNCTION fc_import_transactions(bigint,text,jsonb) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION fc_import_transactions(bigint,text,jsonb) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION fc_import_transactions(bigint,text,jsonb) TO authenticated; END IF;
END $$;

-- 4h. Data API table/sequence privileges (FC objects only)
DO $$ DECLARE tbl text; seq text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['accounts','categories','subcategories','transactions','merchant_memory','scheduled_transactions','transaction_splits','transaction_attachments','reconciliations','import_history','import_profiles'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', tbl);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon', tbl); END IF;
      EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', tbl);
    END IF;
    SELECT pg_get_serial_sequence('public.' || tbl, 'id') INTO seq;
    IF seq IS NOT NULL THEN
      EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated', seq);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon', seq); END IF;
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', seq);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fc_members') THEN
    GRANT SELECT ON fc_members TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON fc_members FROM authenticated;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON fc_members FROM anon; END IF;
    REVOKE ALL ON fc_members FROM PUBLIC;
  END IF;
END $$;

\echo 'Migration applied: tables created, RLS enabled, RPC deployed, grants set.'

-- ============================================================================
-- PHASE 5: Enroll Phil and Crystal
-- ============================================================================
\echo ''
\echo '--- Phase 5: Enroll owners ---'

-- REPLACE THESE WITH ACTUAL UUIDs FROM SUPABASE DASHBOARD BEFORE RUNNING:
-- INSERT INTO fc_members (user_id, role) VALUES
--   ('<phil-uuid>',   'owner'),
--   ('<crystal-uuid>', 'owner')
-- ON CONFLICT DO NOTHING;

-- Placeholder: verify the fc_members table is empty and report action needed
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM fc_members;
  IF cnt = 0 THEN
    RAISE NOTICE 'ACTION REQUIRED: Run the following in SQL Editor after deployment:';
    RAISE NOTICE '  INSERT INTO fc_members (user_id, role) VALUES';
    RAISE NOTICE '    (''<phil-uuid>'',   ''owner''),';
    RAISE NOTICE '    (''<crystal-uuid>'', ''owner'')';
    RAISE NOTICE '  ON CONFLICT DO NOTHING;';
    RAISE NOTICE 'Find UUIDs in: Supabase Dashboard > Authentication > Users';
  ELSE
    RAISE NOTICE 'fc_members already has % enrolled.', cnt;
  END IF;
END $$;

-- ============================================================================
-- PHASE 6: Post-deployment verification
-- ============================================================================
\echo ''
\echo '--- Phase 6: Verify post-deployment state ---'

DO $$
DECLARE
  r record;
  trans_count integer;
  rls_count   integer;
BEGIN
  -- Transactions must be zero
  SELECT count(*) INTO trans_count FROM transactions;
  IF trans_count != 0 THEN
    RAISE EXCEPTION 'FAIL: transactions not empty — % rows remain', trans_count;
  END IF;
  RAISE NOTICE 'PASS: transactions = 0';

  -- Transactional tables must be empty
  IF (SELECT count(*) FROM transaction_splits) != 0 THEN
    RAISE EXCEPTION 'FAIL: transaction_splits not empty';
  END IF;
  IF (SELECT count(*) FROM transaction_attachments) != 0 THEN
    RAISE EXCEPTION 'FAIL: transaction_attachments not empty';
  END IF;
  IF (SELECT count(*) FROM reconciliations) != 0 THEN
    RAISE EXCEPTION 'FAIL: reconciliations not empty';
  END IF;
  RAISE NOTICE 'PASS: all transactional tables empty';

  -- Accounts must be preserved with same IDs and configuration
  FOR r IN SELECT * FROM _pre_deploy_accounts ORDER BY id LOOP
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = r.id AND name = r.name AND type = r.type) THEN
      RAISE EXCEPTION 'FAIL: account id=% name=% type=% was lost', r.id, r.name, r.type;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: all % accounts preserved with original IDs, names, and types', (SELECT count(*) FROM _pre_deploy_accounts);

  -- Categories and subcategories preserved
  IF (SELECT count(*) FROM categories) != (SELECT count(*) FROM _pre_deploy_categories) THEN
    RAISE EXCEPTION 'FAIL: category count changed';
  END IF;
  IF (SELECT count(*) FROM subcategories) != (SELECT count(*) FROM _pre_deploy_subcategories) THEN
    RAISE EXCEPTION 'FAIL: subcategory count changed';
  END IF;
  RAISE NOTICE 'PASS: categories and subcategories preserved';

  -- RLS enabled on all FC tables
  SELECT count(*) INTO rls_count FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true
    AND tablename IN ('accounts','categories','subcategories','transactions','merchant_memory',
      'scheduled_transactions','transaction_splits','transaction_attachments','reconciliations',
      'import_history','import_profiles','fc_members');
  IF rls_count < 12 THEN
    RAISE EXCEPTION 'FAIL: only % of 12 FC tables have RLS enabled', rls_count;
  END IF;
  RAISE NOTICE 'PASS: % FC tables have RLS enabled', rls_count;

  -- Unique constraint on fingerprint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_trans_fingerprint') THEN
    RAISE EXCEPTION 'FAIL: fingerprint unique constraint missing';
  END IF;
  RAISE NOTICE 'PASS: fingerprint unique constraint present';

  -- import_history and import_profiles exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
    RAISE EXCEPTION 'FAIL: import_history table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_profiles') THEN
    RAISE EXCEPTION 'FAIL: import_profiles table missing';
  END IF;
  RAISE NOTICE 'PASS: import_history and import_profiles tables exist';

  -- RPC function exists
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'fc_import_transactions') THEN
    RAISE EXCEPTION 'FAIL: fc_import_transactions function missing';
  END IF;
  RAISE NOTICE 'PASS: fc_import_transactions RPC exists';
END $$;

-- Cleanup temp tables
DROP TABLE IF EXISTS _pre_deploy_accounts;
DROP TABLE IF EXISTS _pre_deploy_categories;
DROP TABLE IF EXISTS _pre_deploy_subcategories;

\echo ''
\echo '========================================'
\echo '  DEPLOYMENT SUCCESSFUL'
\echo '========================================'

COMMIT;

-- ============================================================================
-- POST-COMMIT: Enrollment instructions
-- ============================================================================
\echo ''
\echo '========================================'
\echo '  NEXT STEP: Enroll Phil and Crystal'
\echo '========================================'
\echo '  Run in SQL Editor:'
\echo '    INSERT INTO fc_members (user_id, role) VALUES'
\echo '      (''<phil-uuid>'',   ''owner''),'
\echo '      (''<crystal-uuid>'', ''owner'')'
\echo '    ON CONFLICT DO NOTHING;'
\echo '========================================'
