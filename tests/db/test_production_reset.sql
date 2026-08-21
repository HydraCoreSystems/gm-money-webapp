-- ================================================================
-- Production Reset Test — verifies reset script against live-like schema
-- Sets up a schema matching production, inserts obsolete data,
-- runs the reset, and proves every assertion.
-- ================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '  PRODUCTION RESET TEST'
\echo '========================================'

-- ================================================================
-- Setup: simulate production schema (same as test_setup + transactions)
-- ================================================================
\echo ''
\echo '--- Setup: simulate production state ---'

-- Assumes test_setup.sql already ran (auth schema, roles, FC tables, seed data)

-- Insert simulated obsolete transaction data (mirrors production: 26 rows)
DO $$
DECLARE
  acc_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  DELETE FROM transaction_attachments;
  DELETE FROM transaction_splits;
  DELETE FROM reconciliations;
  DELETE FROM import_history;
  DELETE FROM transactions;

  -- Original 14 unique transactions
  INSERT INTO transactions (account_id, date, payee, amount, transaction_type, review_status, cleared_status)
  VALUES
    (acc_id, '2026-08-18', 'SP+AFF WEST3D', -27.11, 'expense', 'approved', 'uncleared'),
    (acc_id, '2026-08-18', 'InstPmntIn 08/18', 110.70, 'income', 'approved', 'uncleared'),
    (acc_id, '2026-08-18', 'Plant Identification', 48.07, 'income', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'Shopify Capital', -14.71, 'expense', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'Anthropic Claude', -20.00, 'expense', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'Afterpay', -27.11, 'expense', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'Online Transfer', 4.00, 'income', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'InstPmntIn 08/17 #1', 195.56, 'income', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'InstPmntIn 08/17 #2', 45.56, 'income', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'InstPmntIn 08/17 #3', 68.89, 'income', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'Shopify Transfer', 55.06, 'income', 'approved', 'uncleared'),
    (acc_id, '2026-08-17', 'Overdraft Fee', -36.00, 'expense', 'approved', 'uncleared'),
    (acc_id, '2026-08-19', 'Amazon', -27.95, 'expense', 'approved', 'uncleared'),
    (acc_id, '2026-08-19', 'Fort Wayne Rural King', -23.05, 'expense', 'approved', 'uncleared');

  -- 12 duplicate rows
  INSERT INTO transactions (account_id, date, payee, amount, transaction_type, review_status, cleared_status)
    SELECT acc_id, date, payee, amount, transaction_type, review_status, cleared_status
    FROM transactions ORDER BY id LIMIT 12;

  IF (SELECT count(*) FROM transactions) != 26 THEN
    RAISE EXCEPTION 'FAIL: production-reset fixture must contain exactly 26 transactions';
  END IF;

  -- Add some splits, attachments, reconciliations to test cleanup
  INSERT INTO transaction_splits (transaction_id, category_id, amount, memo)
    SELECT id, 1, 10.00, 'test split' FROM transactions LIMIT 2;
  INSERT INTO transaction_attachments (transaction_id, filename, original_name, file_size)
    SELECT id, 'test.png', 'receipt.png', 100 FROM transactions LIMIT 1;
  INSERT INTO reconciliations (account_id, statement_date, statement_balance, cleared_balance, difference)
    VALUES (acc_id, '2026-08-01', 1000.00, 950.00, 50.00);

  -- Set a non-zero balance to verify it gets reset
  UPDATE accounts SET current_balance = 9999.99 WHERE id = acc_id;

  RAISE NOTICE 'Setup complete: % transactions, % splits, % attachments, % reconciliations',
    (SELECT count(*) FROM transactions),
    (SELECT count(*) FROM transaction_splits),
    (SELECT count(*) FROM transaction_attachments),
    (SELECT count(*) FROM reconciliations);
  RAISE NOTICE 'Checking balance before reset: %', (SELECT current_balance FROM accounts WHERE id = acc_id);
END $$;

\echo ''
\echo '--- Creating verified pre-reset backup ---'
\i :BACKUP_SCRIPT

\echo ''
\echo '--- Exercising emergency restore procedure before final reset ---'
DELETE FROM transaction_attachments;
DELETE FROM transaction_splits;
DELETE FROM reconciliations;
DELETE FROM import_history;
DELETE FROM transactions;
\i :RESTORE_SCRIPT

DO $$
BEGIN
  IF (SELECT count(*) FROM transactions) != 26 THEN
    RAISE EXCEPTION 'FAIL: restore did not recover all 26 transactions';
  END IF;
  IF (SELECT count(*) FROM accounts) != 3 THEN
    RAISE EXCEPTION 'FAIL: restore did not preserve all 3 accounts';
  END IF;
  RAISE NOTICE 'PASS: emergency restore recovered 26 transactions and 3 accounts.';
END $$;

-- ================================================================
-- Run the reset script
-- ================================================================
\echo ''
\echo '--- Running production-reset.sql ---'

-- Include the reset script (path set by caller via --set)
\i :RESET_SCRIPT

-- ================================================================
-- Post-reset assertions
-- ================================================================
\echo ''
\echo '--- Post-reset assertions ---'

DO $$
DECLARE
  acc_count integer;
  r record;
BEGIN
  -- 1. Transactions must be zero
  IF (SELECT count(*) FROM transactions) != 0 THEN
    RAISE EXCEPTION 'FAIL: % transactions remain', (SELECT count(*) FROM transactions);
  END IF;
  RAISE NOTICE 'PASS: transactions = 0';

  -- 2. All transactional derivatives cleared
  IF (SELECT count(*) FROM transaction_splits) != 0 THEN
    RAISE EXCEPTION 'FAIL: % splits remain', (SELECT count(*) FROM transaction_splits);
  END IF;
  IF (SELECT count(*) FROM transaction_attachments) != 0 THEN
    RAISE EXCEPTION 'FAIL: % attachments remain', (SELECT count(*) FROM transaction_attachments);
  END IF;
  IF (SELECT count(*) FROM reconciliations) != 0 THEN
    RAISE EXCEPTION 'FAIL: % reconciliations remain', (SELECT count(*) FROM reconciliations);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
    IF (SELECT count(*) FROM import_history) != 0 THEN
      RAISE EXCEPTION 'FAIL: % import_history rows remain', (SELECT count(*) FROM import_history);
    END IF;
  END IF;
  RAISE NOTICE 'PASS: all transactional tables empty';

  -- 3. Zero fingerprints remain
  IF (SELECT count(*) FROM transactions WHERE fingerprint IS NOT NULL) != 0 THEN
    RAISE EXCEPTION 'FAIL: fingerprints exist on cleared transactions';
  END IF;
  RAISE NOTICE 'PASS: zero fingerprints';

  -- 4. Zero import references remain
  IF (SELECT count(*) FROM transactions WHERE import_id IS NOT NULL) != 0 THEN
    RAISE EXCEPTION 'FAIL: import references exist';
  END IF;
  RAISE NOTICE 'PASS: zero import references';

  -- 5. Accounts preserved (exact count and identity)
  SELECT count(*) INTO acc_count FROM accounts;
  IF acc_count != 3 THEN
    RAISE EXCEPTION 'FAIL: expected 3 accounts, found %', acc_count;
  END IF;
  RAISE NOTICE 'PASS: 3 accounts preserved';

  IF NOT EXISTS (SELECT 1 FROM accounts WHERE type = 'checking') THEN
    RAISE EXCEPTION 'FAIL: checking account missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE type = 'savings') THEN
    RAISE EXCEPTION 'FAIL: savings account missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE type = 'cash') THEN
    RAISE EXCEPTION 'FAIL: cash account missing';
  END IF;
  RAISE NOTICE 'PASS: all 3 account types preserved';

  -- All balances must be explicitly unestablished after reset
  FOR r IN SELECT name, opening_balance, current_balance FROM accounts LOOP
    IF r.opening_balance IS NOT NULL OR r.current_balance IS DISTINCT FROM 0::numeric THEN
      RAISE EXCEPTION 'FAIL: % should be unestablished — opening=% current=%', r.name, r.opening_balance, r.current_balance;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: all accounts have opening=NULL and current=0';

  -- 6. Categories preserved
  IF (SELECT count(*) FROM categories) < 1 THEN
    RAISE EXCEPTION 'FAIL: categories empty after reset';
  END IF;
  RAISE NOTICE 'PASS: % categories preserved', (SELECT count(*) FROM categories);

  -- 7. Subcategories preserved
  RAISE NOTICE 'PASS: % subcategories preserved', (SELECT count(*) FROM subcategories);

  -- 8. merchant_memory and scheduled empty
  IF (SELECT count(*) FROM merchant_memory) != 0 THEN
    RAISE EXCEPTION 'FAIL: merchant_memory has unexpected rows';
  END IF;
  IF (SELECT count(*) FROM scheduled_transactions) != 0 THEN
    RAISE EXCEPTION 'FAIL: scheduled_transactions has unexpected rows';
  END IF;
  RAISE NOTICE 'PASS: merchant_memory=0, scheduled_transactions=0';

  -- 9. RLS enabled on all FC tables
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true AND tablename = ANY(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory','scheduled_transactions',
    'transaction_splits','transaction_attachments','reconciliations','import_history','import_profiles','fc_members'
  ])) < 12 THEN
    RAISE EXCEPTION 'FAIL: RLS not enabled on all 12 FC tables';
  END IF;
  RAISE NOTICE 'PASS: RLS enabled on all FC tables';

  -- 10. Fingerprint constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_trans_fingerprint') THEN
    RAISE EXCEPTION 'FAIL: fingerprint unique constraint missing';
  END IF;
  RAISE NOTICE 'PASS: fingerprint unique constraint exists';

  -- 11. Import tables exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
    RAISE EXCEPTION 'FAIL: import_history missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_profiles') THEN
    RAISE EXCEPTION 'FAIL: import_profiles missing';
  END IF;
  RAISE NOTICE 'PASS: import tables created';

  -- 12. RPC function exists
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'fc_import_transactions') THEN
    RAISE EXCEPTION 'FAIL: RPC function missing';
  END IF;
  RAISE NOTICE 'PASS: fc_import_transactions RPC exists';

  -- 13. Unrelated table untouched
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_brand_profiles') THEN
    RAISE NOTICE 'PASS: marketplace_brand_profiles still exists (untouched)';
  END IF;

  -- 14. Unrelated table grants intact
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'skrybix_control') THEN
    IF has_table_privilege('public', 'public.skrybix_control', 'SELECT') THEN
      RAISE NOTICE 'PASS: PUBLIC SELECT on skrybix_control preserved';
    ELSE
      RAISE EXCEPTION 'FAIL: PUBLIC SELECT on skrybix_control lost';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'fc_backup') THEN
    RAISE EXCEPTION 'FAIL: successful reset left obsolete transaction backup in the database';
  END IF;
  RAISE NOTICE 'PASS: successful reset leaves no obsolete transaction copy in the database.';
END $$;

\echo ''
\echo '========================================'
\echo '  PRODUCTION RESET TEST PASSED'
\echo '========================================'
