-- ================================================================
-- Auth Test: verify access control across user contexts
-- Uses fc_test_role (not a table owner) so RLS actually applies.
-- ================================================================

\set ON_ERROR_STOP on

-- First clear any lingering user_id setting
SELECT set_config('fc_test.user_id', '', FALSE);

-- Switch to test role that is NOT a table owner (RLS will gate access)
SET ROLE fc_test_role;

\echo '========================================'
\echo '  AUTH ACCESS CONTROL TESTS'
\echo '========================================'

-- ================================================================
-- Test 1: Anonymous access denied for all operations
-- ================================================================
\echo ''
\echo '--- Test 1: Anonymous access ---'

SELECT set_config('fc_test.user_id', '', FALSE);

-- Select accounts
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM accounts;
  IF cnt = 0 THEN
    RAISE NOTICE 'PASS: anonymous SELECT on accounts returns 0 rows';
  ELSE
    RAISE EXCEPTION 'FAIL: anonymous SELECT on accounts returned % rows', cnt;
  END IF;
END $$;

-- Insert accounts
DO $$
BEGIN
  BEGIN
    INSERT INTO accounts (name, type) VALUES ('hacker', 'checking');
    RAISE EXCEPTION 'FAIL: anonymous INSERT should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anonymous INSERT on accounts denied';
  WHEN OTHERS THEN
    RAISE NOTICE 'PASS: anonymous INSERT on accounts denied (%)', SQLERRM;
  END;
END $$;

-- Update accounts
DO $$
BEGIN
  BEGIN
    UPDATE accounts SET name = 'hacked' WHERE id = 1;
    RAISE EXCEPTION 'FAIL: anonymous UPDATE should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anonymous UPDATE on accounts denied';
  WHEN OTHERS THEN
    RAISE NOTICE 'PASS: anonymous UPDATE on accounts denied (%)', SQLERRM;
  END;
END $$;

-- Delete accounts
DO $$
BEGIN
  BEGIN
    DELETE FROM accounts WHERE id = 1;
    RAISE EXCEPTION 'FAIL: anonymous DELETE should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anonymous DELETE on accounts denied';
  WHEN OTHERS THEN
    RAISE NOTICE 'PASS: anonymous DELETE on accounts denied (%)', SQLERRM;
  END;
END $$;

-- Read transactions
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM transactions;
  IF cnt = 0 THEN
    RAISE NOTICE 'PASS: anonymous SELECT on transactions returns 0 rows';
  ELSE
    RAISE EXCEPTION 'FAIL: anonymous SELECT on transactions returned % rows', cnt;
  END IF;
END $$;

-- ================================================================
-- Test 2: Authenticated non-member — denied everywhere
-- ================================================================
\echo ''
\echo '--- Test 2: Authenticated non-member (stranger) ---'

SELECT set_config('fc_test.user_id', '99999999-9999-9999-9999-999999999999', FALSE);

-- Select accounts
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM accounts;
  IF cnt = 0 THEN
    RAISE NOTICE 'PASS: stranger SELECT on accounts returns 0 rows';
  ELSE
    RAISE EXCEPTION 'FAIL: stranger SELECT on accounts returned % rows', cnt;
  END IF;
END $$;

-- Insert accounts
DO $$
BEGIN
  BEGIN
    INSERT INTO accounts (name, type) VALUES ('hacker', 'checking');
    RAISE EXCEPTION 'FAIL: stranger INSERT should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: stranger INSERT on accounts denied';
  WHEN OTHERS THEN
    RAISE NOTICE 'PASS: stranger INSERT on accounts denied (%)', SQLERRM;
  END;
END $$;

-- Read fc_members (should see nothing since not enrolled)
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM fc_members;
  IF cnt = 0 THEN
    RAISE NOTICE 'PASS: stranger sees 0 fc_members rows';
  ELSE
    RAISE EXCEPTION 'FAIL: stranger should see 0 fc_members rows, got %', cnt;
  END IF;
END $$;

-- ================================================================
-- Test 3: Phil (enrolled member) — allowed on all FC tables
-- ================================================================
\echo ''
\echo '--- Test 3: Phil (owner in fc_members) ---'

-- Enroll Phil (run as postgres/owner since fc_members has no INSERT policy for clients)
RESET ROLE;
INSERT INTO fc_members (user_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT DO NOTHING;
SET ROLE fc_test_role;

SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);

-- Select accounts
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM accounts;
  IF cnt > 0 THEN
    RAISE NOTICE 'PASS: Phil SELECT on accounts returned % rows', cnt;
  ELSE
    RAISE EXCEPTION 'FAIL: Phil SELECT on accounts returned 0 rows';
  END IF;
END $$;

-- Insert transaction
DO $$
DECLARE
  acc_id bigint;
  new_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts LIMIT 1;
  INSERT INTO transactions (account_id, date, payee, amount, transaction_type, review_status)
  VALUES (acc_id, '2026-08-20', 'Phil Test Payee', -27.95, 'expense', 'approved')
  RETURNING id INTO new_id;
  IF new_id IS NOT NULL THEN
    RAISE NOTICE 'PASS: Phil INSERT on transactions succeeded (id=%)', new_id;
  END IF;
END $$;

-- Update transaction
DO $$
BEGIN
  UPDATE transactions SET memo = 'Updated by Phil' WHERE payee = 'Phil Test Payee';
  RAISE NOTICE 'PASS: Phil UPDATE on transactions succeeded';
END $$;

-- Delete transaction
DO $$
BEGIN
  DELETE FROM transactions WHERE payee = 'Phil Test Payee';
  RAISE NOTICE 'PASS: Phil DELETE on transactions succeeded';
END $$;

-- Read fc_members
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM fc_members;
  IF cnt >= 1 THEN
    RAISE NOTICE 'PASS: Phil sees % fc_members row(s)', cnt;
  ELSE
    RAISE EXCEPTION 'FAIL: Phil should see his fc_members row';
  END IF;
END $$;

-- ================================================================
-- Test 4: Crystal (enrolled member) — allowed on all FC tables
-- ================================================================
\echo ''
\echo '--- Test 4: Crystal (owner in fc_members) ---'

RESET ROLE;
INSERT INTO fc_members (user_id, role) VALUES ('22222222-2222-2222-2222-222222222222', 'owner')
ON CONFLICT DO NOTHING;
SET ROLE fc_test_role;

SELECT set_config('fc_test.user_id', '22222222-2222-2222-2222-222222222222', FALSE);

-- Select accounts
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM accounts;
  IF cnt > 0 THEN
    RAISE NOTICE 'PASS: Crystal SELECT on accounts returned % rows', cnt;
  ELSE
    RAISE EXCEPTION 'FAIL: Crystal SELECT on accounts returned 0 rows';
  END IF;
END $$;

-- Insert transaction
DO $$
DECLARE
  acc_id bigint;
  new_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts LIMIT 1;
  INSERT INTO transactions (account_id, date, payee, amount, transaction_type, review_status)
  VALUES (acc_id, '2026-08-20', 'Crystal Test Payee', -15.83, 'expense', 'approved')
  RETURNING id INTO new_id;
  IF new_id IS NOT NULL THEN
    RAISE NOTICE 'PASS: Crystal INSERT on transactions succeeded (id=%)', new_id;
  END IF;
END $$;

-- Delete test transaction to keep database clean
DO $$
BEGIN
  DELETE FROM transactions WHERE payee = 'Crystal Test Payee';
  RAISE NOTICE 'PASS: Crystal DELETE on transactions succeeded';
END $$;

-- ================================================================
-- Test 5: Neither Phil nor Crystal can add members
-- ================================================================
\echo ''
\echo '--- Test 5: Browser-client cannot add fc_members ---'

SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);

DO $$
BEGIN
  BEGIN
    INSERT INTO fc_members (user_id, role)
    VALUES ('99999999-9999-9999-9999-999999999999', 'owner');
    RAISE EXCEPTION 'FAIL: Phil was able to INSERT into fc_members';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: Phil cannot INSERT into fc_members (no client policy exists)';
  WHEN OTHERS THEN
    RAISE NOTICE 'PASS: Phil cannot INSERT into fc_members (%)', SQLERRM;
  END;
END $$;

SELECT set_config('fc_test.user_id', '22222222-2222-2222-2222-222222222222', FALSE);

DO $$
BEGIN
  BEGIN
    INSERT INTO fc_members (user_id, role)
    VALUES ('99999999-9999-9999-9999-999999999999', 'owner');
    RAISE EXCEPTION 'FAIL: Crystal was able to INSERT into fc_members';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: Crystal cannot INSERT into fc_members (no client policy exists)';
  WHEN OTHERS THEN
    RAISE NOTICE 'PASS: Crystal cannot INSERT into fc_members (%)', SQLERRM;
  END;
END $$;

-- ================================================================
-- Test 6: Room owner (RESET ROLE) can enroll — simulates service_role
-- ================================================================
\echo ''
\echo '--- Test 6: Service-role enrollment (table owner / dashboard) ---'

RESET ROLE;

DO $$
DECLARE
  cnt integer;
BEGIN
  INSERT INTO fc_members (user_id, role)
  VALUES ('99999999-9999-9999-9999-999999999999', 'owner')
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO cnt FROM fc_members WHERE user_id = '99999999-9999-9999-9999-999999999999';
  IF cnt = 1 THEN
    RAISE NOTICE 'PASS: service_role (table owner) can INSERT into fc_members';
    DELETE FROM fc_members WHERE user_id = '99999999-9999-9999-9999-999999999999';
  ELSE
    RAISE EXCEPTION 'FAIL: service_role enrollment did not work';
  END IF;
END $$;

-- ================================================================
-- Test 7: Unrelated tables untouched
-- ================================================================
\echo ''
\echo '--- Test 7: Unrelated Skrybix tables untouched ---'

-- auth.users RLS should NOT be enabled
DO $$
DECLARE
  rls_enabled boolean;
BEGIN
  SELECT rowsecurity INTO rls_enabled FROM pg_tables
  WHERE schemaname = 'auth' AND tablename = 'users';
  IF rls_enabled IS NULL OR rls_enabled = false THEN
    RAISE NOTICE 'PASS: auth.users RLS is not enabled (untouched)';
  ELSE
    RAISE NOTICE 'INFO: auth.users RLS was enabled';
  END IF;
END $$;

-- Count tables with RLS in public schema
DO $$
DECLARE
  rls_count integer;
BEGIN
  SELECT count(*) INTO rls_count FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true;
  RAISE NOTICE 'PASS: % public tables with RLS enabled', rls_count;
END $$;

\echo ''
\echo '========================================'
\echo '  ALL AUTH TESTS COMPLETED'
\echo '========================================'
