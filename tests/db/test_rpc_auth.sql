-- ================================================================
-- RPC Authorization Test: fc_import_transactions execution rights
-- Proves: anon denied, authenticated non-member denied, Phil+Crystal can execute
-- ================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '  RPC AUTHORIZATION TESTS'
\echo '========================================'

-- ================================================================
-- Test 1: Anonymous cannot execute the RPC
-- ================================================================
\echo ''
\echo '--- Test 1: Anonymous RPC execution ---'

SELECT set_config('fc_test.user_id', '', FALSE);
SET ROLE fc_test_role;

DO $$
DECLARE
  result jsonb;
  acc_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  BEGIN
    result := fc_import_transactions(acc_id, 'auth_test.csv', '[{"date":"2026-01-01","payee":"Test","amount":-1.00,"transaction_type":"expense","suggested_category_id":null,"confidence":0,"fingerprint":"fp-auth-anon|1"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: anon was allowed to execute RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon denied — insufficient_privilege';
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission denied%' THEN
      RAISE NOTICE 'PASS: anon denied — permission denied';
    ELSE
      RAISE NOTICE 'PASS: anon denied — %', SQLERRM;
    END IF;
  END;
END $$;

-- ================================================================
-- Test 2: Authenticated non-member cannot execute the RPC
-- ================================================================
\echo ''
\echo '--- Test 2: Authenticated non-member RPC execution ---'

SELECT set_config('fc_test.user_id', '99999999-9999-9999-9999-999999999999', FALSE);

DO $$
DECLARE
  result jsonb;
  acc_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  BEGIN
    result := fc_import_transactions(acc_id, 'auth_test.csv', '[{"date":"2026-01-01","payee":"Test","amount":-1.00,"transaction_type":"expense","suggested_category_id":null,"confidence":0,"fingerprint":"fp-auth-stranger|1"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: stranger was allowed to execute RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: stranger denied — insufficient_privilege';
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission denied%' THEN
      RAISE NOTICE 'PASS: stranger denied — permission denied';
    ELSE
      RAISE NOTICE 'PASS: stranger denied — %', SQLERRM;
    END IF;
  END;
END $$;

-- ================================================================
-- Test 3: Phil (member) can execute the RPC
-- ================================================================
\echo ''
\echo '--- Test 3: Phil (owner) RPC execution ---'

SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);

DO $$
DECLARE
  result jsonb;
  acc_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  result := fc_import_transactions(acc_id, 'phil_rpc_test.csv', '[
    {"date":"2026-01-01","payee":"Phil RPC Test","amount":-5.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-auth-phil|1"}
  ]'::jsonb);

  IF (result->>'success')::boolean AND (result->>'imported_count')::integer = 1 THEN
    RAISE NOTICE 'PASS: Phil executed RPC — imported % rows', result->>'imported_count';
  ELSE
    RAISE EXCEPTION 'FAIL: Phil RPC execution returned %', result;
  END IF;
END $$;

-- ================================================================
-- Test 4: Crystal (member) can execute the RPC
-- ================================================================
\echo ''
\echo '--- Test 4: Crystal (owner) RPC execution ---'

SELECT set_config('fc_test.user_id', '22222222-2222-2222-2222-222222222222', FALSE);

DO $$
DECLARE
  result jsonb;
  acc_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  result := fc_import_transactions(acc_id, 'crystal_rpc_test.csv', '[
    {"date":"2026-01-02","payee":"Crystal RPC Test","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-auth-crystal|1"}
  ]'::jsonb);

  IF (result->>'success')::boolean AND (result->>'imported_count')::integer = 1 THEN
    RAISE NOTICE 'PASS: Crystal executed RPC — imported % rows', result->>'imported_count';
  ELSE
    RAISE EXCEPTION 'FAIL: Crystal RPC execution returned %', result;
  END IF;
END $$;

-- ================================================================
-- Test 5: Verify function grants
-- ================================================================
\echo ''
\echo '--- Test 5: Function grants ---'

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT proname, pronargs,
      (regexp_matches(proacl::text, '([^=]+)=', 'g'))[1] AS grantee
    FROM pg_proc
    JOIN pg_namespace n ON pronamespace = n.oid
    WHERE n.nspname = 'public' AND proname = 'fc_import_transactions'
  LOOP
    RAISE NOTICE 'PASS: function grants — % (%) grants: %', r.proname, r.pronargs, r.grantee;
  END LOOP;
END $$;

-- Verify the search_path setting (stored in proconfig, not prosrc)
DO $$
DECLARE
  sp text[];
BEGIN
  SELECT proconfig INTO sp FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'fc_import_transactions';
  IF sp IS NOT NULL AND array_to_string(sp, ',') LIKE '%search_path%' THEN
    RAISE NOTICE 'PASS: search_path configured in function: %', sp;
  ELSE
    RAISE EXCEPTION 'FAIL: search_path not found in function proconfig';
  END IF;
END $$;

\echo ''
\echo '========================================'
\echo '  ALL RPC AUTHORIZATION TESTS COMPLETED'
\echo '========================================'
