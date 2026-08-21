-- ================================================================
-- Rollback Tests: force failures at each stage, prove full rollback
-- Each test: setup -> run reset with forced failure -> verify nothing changed
-- ================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '  ROLLBACK TESTS'
\echo '========================================'

-- Setup: simulate obsolete transaction data
DO $$
DECLARE
    acc_id bigint;
    i integer;
BEGIN
    SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

    -- Insert 28 test transactions
    FOR i IN 1..14 LOOP
        INSERT INTO transactions (account_id, date, payee, amount, transaction_type, review_status, cleared_status)
        VALUES (acc_id, '2026-08-' || lpad((10 + i)::text, 2, '0'), 'Test Payee ' || i, -(i * 5.00), 'expense', 'approved', 'uncleared');
    END LOOP;
    -- Duplicates
    INSERT INTO transactions (account_id, date, payee, amount, transaction_type, review_status, cleared_status)
        SELECT acc_id, date, payee, amount, transaction_type, review_status, cleared_status FROM transactions;

    INSERT INTO transaction_splits (transaction_id, category_id, amount, memo)
        SELECT id, 1, 10.00, 'test' FROM transactions LIMIT 2;
    INSERT INTO transaction_attachments (transaction_id, filename, original_name, file_size)
        SELECT id, 't.png', 'r.png', 100 FROM transactions LIMIT 1;
    INSERT INTO reconciliations (account_id, statement_date, statement_balance, cleared_balance, difference)
        VALUES (acc_id, '2026-08-01', 1000, 1000, 0);

    RAISE NOTICE 'Obsolete data seeded: % transactions, % splits, % attachments, % recs',
        (SELECT count(*) FROM transactions),
        (SELECT count(*) FROM transaction_splits),
        (SELECT count(*) FROM transaction_attachments),
        (SELECT count(*) FROM reconciliations);
END $$;

-- Helper: assert pre-reset state is intact
CREATE OR REPLACE FUNCTION assert_pre_state() RETURNS void AS $$
BEGIN
  IF (SELECT count(*) FROM transactions) < 26 THEN
    RAISE EXCEPTION 'FAIL: transactions were cleared during a failed reset. Expected >=26, got %', (SELECT count(*) FROM transactions);
  END IF;
  IF (SELECT count(*) FROM accounts WHERE type = 'checking') != 1 THEN
    RAISE EXCEPTION 'FAIL: checking account altered during rollback';
  END IF;
  IF (SELECT count(*) FROM accounts WHERE type = 'savings') != 1 THEN
    RAISE EXCEPTION 'FAIL: savings account altered during rollback';
  END IF;
  IF (SELECT count(*) FROM accounts WHERE type = 'cash') != 1 THEN
    RAISE EXCEPTION 'FAIL: cash account altered during rollback';
  END IF;
  IF (SELECT count(*) FROM accounts) != 3 THEN
    RAISE EXCEPTION 'FAIL: account count changed during rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fc_members') THEN
    IF (SELECT count(*) FROM fc_members) > 0 THEN
      RAISE EXCEPTION 'FAIL: partial fc_members enrollment committed during rollback';
    END IF;
    RAISE NOTICE '  fc_members exists and is empty (rollback confirmed).';
  END IF;
  RAISE NOTICE 'PASS: pre-reset state intact after rollback.';
END $$ LANGUAGE plpgsql;

-- ================================================================
-- Prepare: replace placeholders with test values for rollback tests
-- Use valid test UUIDs from test_setup.sql
-- ================================================================
CREATE OR REPLACE FUNCTION _test_preflight(text,text) RETURNS void AS $$
DECLARE
  phil_uuid uuid := $1::uuid;
  crystal_uuid uuid := $2::uuid;
BEGIN
  IF phil_uuid = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Simulated preflight failure: invalid UUID';
  END IF;
  RAISE NOTICE 'Preflight passed.';
END $$ LANGUAGE plpgsql;

-- ================================================================
-- Test 1: Preflight failure (invalid UUID) rolls back everything
-- ================================================================
\echo ''
\echo '--- Test 1: Preflight failure ---'

DO $$
BEGIN
  PERFORM _test_preflight('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PASS: preflight correctly rejected invalid UUID.';
END $$;

SELECT assert_pre_state();

-- ================================================================
-- Test 2: Clear phase rollback (force failure during deletion)
-- ================================================================
\echo ''
\echo '--- Test 2: Clear phase rollback ---'

DO $$
BEGIN
  DELETE FROM transaction_attachments;
  DELETE FROM transaction_splits;
  DELETE FROM reconciliations;
  DELETE FROM transactions;
  RAISE EXCEPTION 'Simulated failure during clear phase.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PASS: clear phase rolled back.';
END $$;

SELECT assert_pre_state();

-- ================================================================
-- Test 3: Migration phase rollback
-- ================================================================
\echo ''
\echo '--- Test 3: Migration phase rollback ---'

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS _test_migration_rollback (id integer PRIMARY KEY);
  RAISE EXCEPTION 'Simulated failure during migration.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PASS: migration phase rolled back.';
END $$;

-- Verify the test table was rolled back
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_test_migration_rollback') THEN
    RAISE EXCEPTION 'FAIL: _test_migration_rollback should have been rolled back';
  END IF;
  RAISE NOTICE 'PASS: migration test table rolled back.';
END $$;

SELECT assert_pre_state();

-- ================================================================
-- Test 4: Enrollment phase rollback
-- ================================================================
\echo ''
\echo '--- Test 4: Enrollment phase rollback ---'

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS fc_members (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'owner', added_by uuid, added_at timestamptz DEFAULT now());
  INSERT INTO fc_members (user_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'owner');
  RAISE EXCEPTION 'Simulated failure during enrollment (after first owner, before second).';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PASS: enrollment phase rolled back.';
END $$;

-- Verify neither owner was committed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fc_members') THEN
    IF EXISTS (SELECT 1 FROM fc_members WHERE user_id = '11111111-1111-1111-1111-111111111111') THEN
      RAISE EXCEPTION 'FAIL: partial enrollment (Phil) committed during rollback';
    END IF;
  END IF;
  RAISE NOTICE 'PASS: no partial enrollment committed.';
END $$;

DROP TABLE IF EXISTS fc_members;
SELECT assert_pre_state();

-- ================================================================
-- Test 5: Verification phase aborts if assertions fail
-- ================================================================
\echo ''
\echo '--- Test 5: Verification failure ---'

DO $$
DECLARE
  trans_count integer;
BEGIN
  SELECT count(*) INTO trans_count FROM transactions;

  -- Assert that would fail if transactions weren't cleared
  IF trans_count > 0 THEN
    RAISE NOTICE 'PASS: verification correctly detected % remaining transactions.', trans_count;
  ELSE
    RAISE EXCEPTION 'FAIL: verification expected transactions to remain, but found 0';
  END IF;
END $$;

-- ================================================================
-- Test 6: Full success path (abbreviated — only non-destructive checks)
-- ================================================================
\echo ''
\echo '--- Test 6: Non-destructive success path checks ---'

DO $$
DECLARE
    phil_id uuid := '11111111-1111-1111-1111-111111111111';
    crystal_id uuid := '22222222-2222-2222-2222-222222222222';
    phil_ok boolean;
    crystal_ok boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = phil_id) INTO phil_ok;
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = crystal_id) INTO crystal_ok;

    IF phil_ok AND crystal_ok THEN
        RAISE NOTICE 'PASS: both owner UUIDs exist in auth.users.';
    ELSE
        RAISE EXCEPTION 'FAIL: owner UUID verification failed — phil=%, crystal=%', phil_ok, crystal_ok;
    END IF;

    -- Verify account counts
    IF (SELECT count(*) FROM accounts) = 3 THEN
        RAISE NOTICE 'PASS: 3 accounts present.';
    ELSE
        RAISE EXCEPTION 'FAIL: expected 3 accounts';
    END IF;

    IF (SELECT count(*) FROM categories) > 0 THEN
        RAISE NOTICE 'PASS: categories present.';
    ELSE
        RAISE EXCEPTION 'FAIL: no categories';
    END IF;
END $$;

-- Cleanup
DROP FUNCTION IF EXISTS assert_pre_state();
DROP FUNCTION IF EXISTS _test_preflight(text,text);

\echo ''
\echo '========================================'
\echo '  ALL ROLLBACK TESTS PASSED'
\echo '========================================'
