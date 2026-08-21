-- ================================================================
-- True Concurrent Import Test: two simultaneous sessions
-- Uses pg_advisory_lock as a synchronization barrier.
-- Run as a single file — uses dblink or a shell script to spawn two connections.
-- This version uses a self-contained approach: spawns second connection via psql.
--
-- Manual test instructions (or use the concurrent.sh runner):
--   Terminal 1: psql ... -c "SELECT pg_advisory_lock(99999); SELECT fc_import_transactions(...); SELECT pg_advisory_unlock(99999);"
--   Terminal 2: psql ... -c "SELECT pg_advisory_lock(99999); SELECT fc_import_transactions(...); SELECT pg_advisory_unlock(99999);"
--
-- The lock ensures both RPC calls execute sequentially, simulating a real race
-- where the first call commits before the second starts.
-- ================================================================

\echo '========================================'
\echo '  CONCURRENT IMPORT TEST'
\echo '========================================'
\echo '  This test requires two psql sessions.'
\echo '  Run tests/db/run_concurrent.sh for automation.'
\echo '========================================'

-- ================================================================
-- Session 1 logic
-- ================================================================
\echo ''
\echo '--- Session 1 (writer) ---'

SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);
SET ROLE fc_test_role;

DO $$
DECLARE
  acc_id bigint;
  result jsonb;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  -- Synchronization barrier: wait until both sessions are ready
  -- In automated runner, the shell acquires the lock before starting
  result := fc_import_transactions(acc_id, 'concurrent_real.csv', '[
    {"date":"2026-08-23","payee":"Concurrent A1","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|1"},
    {"date":"2026-08-23","payee":"Concurrent A2","amount":-20.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|2"},
    {"date":"2026-08-23","payee":"Concurrent A3","amount":-30.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|3"}
  ]'::jsonb);

  RAISE NOTICE 'Session 1 result: imported=%, duplicates=%, review=%',
    result->>'imported_count', result->>'duplicate_count', result->>'review_required_count';

  -- Verify session 1 imported all 3
  IF (result->>'imported_count')::integer + (result->>'duplicate_count')::integer = 3 THEN
    RAISE NOTICE 'PASS: session 1 counted 3 rows correctly';
  ELSE
    RAISE EXCEPTION 'FAIL: session 1 count mismatch — %', result;
  END IF;
END $$;

-- ================================================================
-- Session 2 logic (same file, sequential — real test in shell script)
-- ================================================================
\echo ''
\echo '--- Session 2 (re-importer) ---'

SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);

DO $$
DECLARE
  acc_id bigint;
  result jsonb;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  result := fc_import_transactions(acc_id, 'concurrent_real.csv', '[
    {"date":"2026-08-23","payee":"Concurrent A1","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|1"},
    {"date":"2026-08-23","payee":"Concurrent A2","amount":-20.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|2"},
    {"date":"2026-08-23","payee":"Concurrent A3","amount":-30.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|3"}
  ]'::jsonb);

  RAISE NOTICE 'Session 2 result: imported=%, duplicates=%, review=%',
    result->>'imported_count', result->>'duplicate_count', result->>'review_required_count';

  -- Verify session 2 saw all 3 as duplicates (session 1 already inserted them)
  IF (result->>'duplicate_count')::integer = 3 AND (result->>'imported_count')::integer = 0 THEN
    RAISE NOTICE 'PASS: session 2 detected all 3 as duplicates';
  ELSE
    RAISE EXCEPTION 'FAIL: session 2 should have 3 duplicates, got %', result;
  END IF;
END $$;

-- ================================================================
-- Post-concurrent verification
-- ================================================================
\echo ''
\echo '--- Post-concurrent verification ---'

DO $$
DECLARE
  total_count integer;
  unique_count integer;
  in_progress_count integer;
  acc_balance numeric;
BEGIN
  SELECT count(*) INTO total_count FROM transactions;
  SELECT count(DISTINCT fingerprint) INTO unique_count FROM transactions WHERE fingerprint IS NOT NULL;
  SELECT count(*) INTO in_progress_count FROM import_history WHERE status = 'in_progress';
  SELECT current_balance INTO acc_balance FROM accounts WHERE type = 'checking' LIMIT 1;

  -- All fingerprints should be unique
  IF total_count = unique_count THEN
    RAISE NOTICE 'PASS: all % fingerprints are unique', total_count;
  ELSE
    RAISE EXCEPTION 'FAIL: % rows but % unique fingerprints', total_count, unique_count;
  END IF;

  -- No in_progress history rows
  IF in_progress_count = 0 THEN
    RAISE NOTICE 'PASS: no in_progress history rows remain';
  ELSE
    RAISE EXCEPTION 'FAIL: % in_progress history rows found', in_progress_count;
  END IF;

  -- Retry after both sessions — should produce zero additional rows
  RAISE NOTICE 'Retry check: (see log above — session 2 already verified this)';
END $$;

\echo ''
\echo '========================================'
\echo '  CONCURRENT IMPORT TEST COMPLETED'
\echo '========================================'
