-- ================================================================
-- RPC Import Tests: atomicity, classification, rollback, concurrent
-- Run with: psql -f tests/db/test_rpc_import.sql
-- ================================================================

\set ON_ERROR_STOP on

SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);
SET ROLE fc_test_role;

\echo '========================================'
\echo '  ATOMIC RPC IMPORT TESTS'
\echo '========================================'

-- ================================================================
-- Setup: clean state
-- ================================================================
RESET ROLE;
DELETE FROM transactions;
DELETE FROM import_history;
-- Reset account balance
UPDATE accounts SET current_balance = opening_balance WHERE type = 'checking';
SET ROLE fc_test_role;

DO $$
DECLARE
  acc_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  RAISE NOTICE 'Setup: test account_id=%, % transactions, % history rows',
    acc_id, (SELECT count(*) FROM transactions), (SELECT count(*) FROM import_history);
END $$;

-- ================================================================
-- Test 1: Happy path — full import succeeds atomically
-- ================================================================
\echo ''
\echo '--- Test 1: Happy path atomic import ---'

DO $$
DECLARE
  acc_id bigint;
  result jsonb;
  trans_count integer;
  hist_row record;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  -- 4 transactions: 2 high-conf items, 2 low-conf items
  result := fc_import_transactions(acc_id, 'test_happy_path.csv', '[
    {"date":"2026-08-19","payee":"Amazon","original_description":"Amazon","amount":-27.95,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-happy-a|1"},
    {"date":"2026-08-19","payee":"Amazon","original_description":"Amazon","amount":-27.95,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-happy-a|2"},
    {"date":"2026-08-19","payee":"WeirdCo","original_description":"WeirdCo","amount":-10.00,"transaction_type":"expense","suggested_category_id":null,"suggested_subcategory_id":null,"confidence":0.3,"fingerprint":"fp-happy-b|1"},
    {"date":"2026-08-19","payee":"MysteryInc","original_description":"MysteryInc","amount":-5.00,"transaction_type":"expense","suggested_category_id":null,"suggested_subcategory_id":null,"confidence":0.1,"fingerprint":"fp-happy-c|1"}
  ]'::jsonb);

  SELECT count(*) INTO trans_count FROM transactions WHERE import_id = (result->>'import_id')::bigint;
  SELECT * INTO hist_row FROM import_history WHERE id = (result->>'import_id')::bigint;

  IF (result->>'success')::boolean = true
     AND (result->>'imported_count')::integer = 4
     AND (result->>'duplicate_count')::integer = 0
     AND (result->>'review_required_count')::integer = 2
     AND trans_count = 4
     AND hist_row.status = 'completed'
  THEN
    RAISE NOTICE 'PASS: happy path — 4 imported, 2 review, 2 approved, history completed';
    RAISE NOTICE '  result: %', result;
  ELSE
    RAISE EXCEPTION 'FAIL: happy path — result=%, trans_count=%, status=%', result, trans_count, hist_row.status;
  END IF;

  -- Verify classification: 2 approved (confidence >= 0.7 + has category), 2 pending review
  IF (SELECT count(*) FROM transactions WHERE import_id = (result->>'import_id')::bigint AND review_status = 'approved') = 2
     AND (SELECT count(*) FROM transactions WHERE import_id = (result->>'import_id')::bigint AND review_status = 'pending_review') = 2
  THEN
    RAISE NOTICE 'PASS: classification — 2 approved, 2 review (mutually exclusive)';
  ELSE
    RAISE EXCEPTION 'FAIL: classification overlap detected';
  END IF;
END $$;

-- ================================================================
-- Test 2: Reimport same file — idempotent
-- ================================================================
\echo ''
\echo '--- Test 2: Reimport same file (idempotent) ---'

DO $$
DECLARE
  acc_id bigint;
  before_count integer;
  result jsonb;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  SELECT count(*) INTO before_count FROM transactions;

  result := fc_import_transactions(acc_id, 'test_happy_path.csv', '[
    {"date":"2026-08-19","payee":"Amazon","original_description":"Amazon","amount":-27.95,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-happy-a|1"},
    {"date":"2026-08-19","payee":"Amazon","original_description":"Amazon","amount":-27.95,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-happy-a|2"},
    {"date":"2026-08-19","payee":"WeirdCo","original_description":"WeirdCo","amount":-10.00,"transaction_type":"expense","suggested_category_id":null,"suggested_subcategory_id":null,"confidence":0.3,"fingerprint":"fp-happy-b|1"},
    {"date":"2026-08-19","payee":"MysteryInc","original_description":"MysteryInc","amount":-5.00,"transaction_type":"expense","suggested_category_id":null,"suggested_subcategory_id":null,"confidence":0.1,"fingerprint":"fp-happy-c|1"}
  ]'::jsonb);

  IF (result->>'imported_count')::integer = 0
     AND (result->>'duplicate_count')::integer = 4
     AND (result->>'review_required_count')::integer = 0
     AND (SELECT count(*) FROM transactions) = before_count
  THEN
    RAISE NOTICE 'PASS: reimport — 0 new, 4 duplicates, transaction count unchanged (%)', before_count;
  ELSE
    RAISE EXCEPTION 'FAIL: reimport — result=%, count changed to %', result, (SELECT count(*) FROM transactions);
  END IF;
END $$;

-- ================================================================
-- Test 3: Real rollback — failure mid-import leaves nothing
-- ================================================================
\echo ''
\echo '--- Test 3: Rollback on duplicate fingerprint insertion ---'

DO $$
DECLARE
  acc_id bigint;
  before_trans integer;
  before_hist integer;
  before_bal numeric;
  result jsonb;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  SELECT count(*) INTO before_trans FROM transactions;
  SELECT count(*) INTO before_hist FROM import_history;
  SELECT current_balance INTO before_bal FROM accounts WHERE id = acc_id;

  -- Force a NOT NULL violation mid-import: row 2 has no payee
  -- The RPC must roll back ALL changes (history + row 1 + balance)
  BEGIN
    result := fc_import_transactions(acc_id, 'rollback_test.csv', '[
      {"date":"2026-08-20","payee":"New1","original_description":"New1","amount":-50.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-rollback-new|1"},
      {"date":"2026-08-20","payee":null,"original_description":null,"amount":-60.00,"transaction_type":"expense","suggested_category_id":null,"confidence":0.3,"fingerprint":"fp-rollback-new|2"},
      {"date":"2026-08-20","payee":"New3","original_description":"New3","amount":-25.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-rollback-new|3"}
    ]'::jsonb);
    RAISE EXCEPTION 'FAIL: RPC should have thrown NOT NULL violation on null payee';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS: RPC raised error on constraint violation: %', SQLERRM;
  END;

  -- Verify nothing persisted
  IF (SELECT count(*) FROM transactions) = before_trans THEN
    RAISE NOTICE 'PASS: rollback — transaction count unchanged (%)', before_trans;
  ELSE
    RAISE EXCEPTION 'FAIL: partial transactions remain — before=%, after=%', before_trans, (SELECT count(*) FROM transactions);
  END IF;

  IF (SELECT count(*) FROM import_history) = before_hist THEN
    RAISE NOTICE 'PASS: rollback — no import history record left behind';
  ELSE
    RAISE EXCEPTION 'FAIL: orphan import history record remains';
  END IF;

  IF (SELECT current_balance FROM accounts WHERE id = acc_id) = before_bal THEN
    RAISE NOTICE 'PASS: rollback — account balance unchanged (%)', before_bal;
  ELSE
    RAISE EXCEPTION 'FAIL: balance changed after rollback';
  END IF;

  -- Retry with correct data — succeeds exactly once
  result := fc_import_transactions(acc_id, 'rollback_retry.csv', '[
    {"date":"2026-08-20","payee":"New1","original_description":"New1","amount":-50.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-rollback-new|1"},
    {"date":"2026-08-20","payee":"New2","original_description":"New2","amount":-60.00,"transaction_type":"expense","suggested_category_id":null,"confidence":0.3,"fingerprint":"fp-rollback-new|2"},
    {"date":"2026-08-20","payee":"New3","original_description":"New3","amount":-25.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-rollback-new|3"}
  ]'::jsonb);

  IF (result->>'imported_count')::integer = 3
     AND (SELECT count(*) FROM transactions WHERE import_id = (result->>'import_id')::bigint) = 3
  THEN
    RAISE NOTICE 'PASS: retry after rollback — all 3 imported correctly';
  ELSE
    RAISE EXCEPTION 'FAIL: retry after rollback failed — result=%', result;
  END IF;
END $$;

-- ================================================================
-- Test 4: Classification is strictly mutually exclusive
-- ================================================================
\echo ''
\echo '--- Test 4: Classification mutual exclusion ---'

DO $$
DECLARE
  acc_id bigint;
  result jsonb;
  approved_count integer;
  review_count integer;
  total_count integer;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  -- Edge cases for classification:
  -- Row 1: high conf + has category → approved
  -- Row 2: high conf + NO category → review (not approved)
  -- Row 3: low conf + has category → review (not approved)
  -- Row 4: low conf + NO category → review
  -- Row 5: null confidence + has category → review
  -- Row 6: confidence exactly 0.7 + has category → approved
  result := fc_import_transactions(acc_id, 'classification_test.csv', '[
    {"date":"2026-08-21","payee":"HCat","original_description":"HCat","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-class-a|1"},
    {"date":"2026-08-21","payee":"HNoCat","original_description":"HNoCat","amount":-20.00,"transaction_type":"expense","suggested_category_id":null,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-class-b|1"},
    {"date":"2026-08-21","payee":"LCat","original_description":"LCat","amount":-30.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.3,"fingerprint":"fp-class-c|1"},
    {"date":"2026-08-21","payee":"LNoCat","original_description":"LNoCat","amount":-40.00,"transaction_type":"expense","suggested_category_id":null,"suggested_subcategory_id":null,"confidence":0.1,"fingerprint":"fp-class-d|1"},
    {"date":"2026-08-21","payee":"NullConf","original_description":"NullConf","amount":-50.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":null,"fingerprint":"fp-class-e|1"},
    {"date":"2026-08-21","payee":"Edge","original_description":"Edge","amount":-60.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.7,"fingerprint":"fp-class-f|1"}
  ]'::jsonb);

  SELECT count(*) INTO approved_count FROM transactions WHERE import_id = (result->>'import_id')::bigint AND review_status = 'approved';
  SELECT count(*) INTO review_count FROM transactions WHERE import_id = (result->>'import_id')::bigint AND review_status = 'pending_review';
  SELECT count(*) INTO total_count FROM transactions WHERE import_id = (result->>'import_id')::bigint;

  IF approved_count = 2 AND review_count = 4 AND total_count = 6 THEN
    RAISE NOTICE 'PASS: classification — % approved + % review = % total (no overlap, no orphans)', approved_count, review_count, total_count;
  ELSE
    RAISE EXCEPTION 'FAIL: classification — % approved + % review = % total (expected 2+4=6)', approved_count, review_count, total_count;
  END IF;
END $$;

-- ================================================================
-- Test 5: Two simultaneous imports of the same data — one commits
-- ================================================================
\echo ''
\echo '--- Test 5: Concurrent same-file import ---'

DO $$
DECLARE
  acc_id bigint;
  result1 jsonb;
  result2 jsonb;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  -- First import
  result1 := fc_import_transactions(acc_id, 'concurrent_test.csv', '[
    {"date":"2026-08-22","payee":"Concur1","original_description":"Concur1","amount":-11.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-concur|1"},
    {"date":"2026-08-22","payee":"Concur2","original_description":"Concur2","amount":-22.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-concur|2"}
  ]'::jsonb);

  -- Immediate second import with same fingerprints
  result2 := fc_import_transactions(acc_id, 'concurrent_test.csv', '[
    {"date":"2026-08-22","payee":"Concur1","original_description":"Concur1","amount":-11.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-concur|1"},
    {"date":"2026-08-22","payee":"Concur2","original_description":"Concur2","amount":-22.00,"transaction_type":"expense","suggested_category_id":1,"suggested_subcategory_id":null,"confidence":0.95,"fingerprint":"fp-concur|2"}
  ]'::jsonb);

  IF (result1->>'imported_count')::integer = 2
     AND (result2->>'imported_count')::integer = 0
     AND (result2->>'duplicate_count')::integer = 2
  THEN
    RAISE NOTICE 'PASS: concurrent — first import committed 2, second import detected 2 duplicates';
  ELSE
    RAISE EXCEPTION 'FAIL: concurrent — result1=%, result2=%', result1, result2;
  END IF;
END $$;

-- ================================================================
-- Test 6: Empty import returns immediately
-- ================================================================
\echo ''
\echo '--- Test 6: Empty import ---'

DO $$
DECLARE
  acc_id bigint;
  before_hist integer;
  result jsonb;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  SELECT count(*) INTO before_hist FROM import_history;

  result := fc_import_transactions(acc_id, 'empty.csv', '[]'::jsonb);

  IF (result->>'success')::boolean = true
     AND (result->>'imported_count')::integer = 0
     AND (SELECT count(*) FROM import_history) = before_hist
  THEN
    RAISE NOTICE 'PASS: empty import — returns success without creating orphan history';
  ELSE
    RAISE EXCEPTION 'FAIL: empty import created side effects';
  END IF;
END $$;

-- ================================================================
-- Test 7: Non-existent account raises exception
-- ================================================================
\echo ''
\echo '--- Test 7: Non-existent account ---'

DO $$
DECLARE
  result jsonb;
BEGIN
  BEGIN
    result := fc_import_transactions(999999, 'bad_account.csv', '[{"date":"2026-01-01","payee":"Test","amount":-1.00,"transaction_type":"expense","suggested_category_id":null,"confidence":0,"fingerprint":"fp-bad-acct|1"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: RPC should have thrown for non-existent account';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%does not exist%' THEN
      RAISE NOTICE 'PASS: non-existent account correctly rejected: %', SQLERRM;
    ELSE
      RAISE EXCEPTION 'FAIL: wrong error for non-existent account: %', SQLERRM;
    END IF;
  END;
END $$;

-- ================================================================
-- Test 8: Balance recalculation after import
-- ================================================================
\echo ''
\echo '--- Test 7: Balance after import ---'

DO $$
DECLARE
  acc_id bigint;
  open_bal numeric;
  new_bal numeric;
  approved_sum numeric;
BEGIN
  SELECT id, opening_balance INTO acc_id, open_bal FROM accounts WHERE type = 'checking' LIMIT 1;
  SELECT sum(amount) INTO approved_sum FROM transactions
  WHERE account_id = acc_id AND review_status = 'approved';

  new_bal := COALESCE(open_bal, 0) + COALESCE(approved_sum, 0);

  IF (SELECT current_balance FROM accounts WHERE id = acc_id) = new_bal THEN
    RAISE NOTICE 'PASS: balance — current_balance = opening(%) + approved_sum(%) = %', open_bal, approved_sum, new_bal;
  ELSE
    RAISE EXCEPTION 'FAIL: balance mismatch. Current=%, Expected=%', (SELECT current_balance FROM accounts WHERE id = acc_id), new_bal;
  END IF;
END $$;

\echo ''
\echo '========================================'
\echo '  ALL ATOMIC RPC IMPORT TESTS COMPLETED (1-8)'
\echo '========================================'
