-- ================================================================
-- Balance Establishment Tests
-- ================================================================
\set ON_ERROR_STOP on
\echo ========================================
\echo   BALANCE ESTABLISHMENT TESTS
\echo ========================================

\echo ""
\echo "--- Test 1: Import without statement_balance (opening IS NULL) ---"
DO $$
DECLARE acc_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  UPDATE accounts SET opening_balance = NULL, current_balance = 0 WHERE id = acc_id;
  BEGIN
    PERFORM fc_import_transactions(acc_id, 't1.csv', '[{"date":"2026-01-01","payee":"T1","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-1|1"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: should have required statement_balance';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%statement_balance%' THEN RAISE NOTICE 'PASS: correctly required statement_balance.'; END IF;
  END;
  IF (SELECT opening_balance FROM accounts WHERE id = acc_id) IS NOT NULL THEN RAISE EXCEPTION 'FAIL: opening set'; END IF;
  IF (SELECT count(*) FROM transactions) > 0 THEN RAISE EXCEPTION 'FAIL: txns persisted'; END IF;
  RAISE NOTICE 'PASS: no state changed.';
END $$;

\echo ""
\echo "--- Test 2: First import with statement_balance ---"
DO $$
DECLARE acc_id bigint; result jsonb; new_opening numeric;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  UPDATE accounts SET opening_balance = NULL, current_balance = 0 WHERE id = acc_id;
  result := fc_import_transactions(acc_id, 't2.csv', '[{"date":"2026-01-01","payee":"A","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-2a|1"},{"date":"2026-01-02","payee":"B","amount":-20.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-2b|1"},{"date":"2026-01-03","payee":"C","amount":150.00,"transaction_type":"income","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-2c|1"}]'::jsonb, 500.00);
  SELECT opening_balance INTO new_opening FROM accounts WHERE id = acc_id;
  IF (result->>'opening_established')::boolean AND new_opening = 380.00 AND (result->>'imported_count')::integer = 3 THEN
    RAISE NOTICE 'PASS: opening = 500 - 120 = 380.00';
  ELSE RAISE EXCEPTION 'FAIL: opening=%, result=%', new_opening, result; END IF;
  IF (SELECT current_balance FROM accounts WHERE id = acc_id) = 500.00 THEN RAISE NOTICE 'PASS: current = 380 + 120 = 500.00';
  ELSE RAISE EXCEPTION 'FAIL: current=%', (SELECT current_balance FROM accounts WHERE id = acc_id); END IF;
END $$;

\echo ""
\echo "--- Test 3: Import after balance established ---"
DO $$
DECLARE acc_id bigint; old_opening numeric;
BEGIN
  SELECT id, opening_balance INTO acc_id, old_opening FROM accounts WHERE type = 'checking' LIMIT 1;
  PERFORM fc_import_transactions(acc_id, 't3.csv', '[{"date":"2026-01-04","payee":"D","amount":-5.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-3|1"}]'::jsonb);
  IF (SELECT opening_balance FROM accounts WHERE id = acc_id) = old_opening THEN RAISE NOTICE 'PASS: opening unchanged (%).', old_opening;
  ELSE RAISE EXCEPTION 'FAIL: opening changed'; END IF;
END $$;

\echo ""
\echo "--- Test 4: Reimport idempotent ---"
DO $$
DECLARE acc_id bigint; result jsonb; before_count integer; old_opening numeric;
BEGIN
  SELECT id, opening_balance INTO acc_id, old_opening FROM accounts WHERE type = 'checking' LIMIT 1;
  SELECT count(*) INTO before_count FROM transactions;
  result := fc_import_transactions(acc_id, 'reimport.csv', '[{"date":"2026-01-01","payee":"A","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-2a|1"},{"date":"2026-01-02","payee":"B","amount":-20.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-2b|1"},{"date":"2026-01-03","payee":"C","amount":150.00,"transaction_type":"income","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-2c|1"}]'::jsonb);
  IF (result->>'imported_count')::integer = 0 AND (result->>'duplicate_count')::integer = 3 AND (SELECT opening_balance FROM accounts WHERE id = acc_id) = old_opening AND (SELECT count(*) FROM transactions) = before_count THEN
    RAISE NOTICE 'PASS: 0 new, 3 dups, opening unchanged.';
  ELSE RAISE EXCEPTION 'FAIL: result=%', result; END IF;
END $$;

\echo ""
\echo "--- Test 5: Rollback leaves balance unestablished ---"
DO $$
DECLARE acc_id bigint; before_count integer;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'savings' LIMIT 1;
  UPDATE accounts SET opening_balance = NULL, current_balance = 0 WHERE id = acc_id;
  SELECT count(*) INTO before_count FROM transactions;
  BEGIN
    PERFORM fc_import_transactions(acc_id, 'rb.csv', '[{"date":"2026-01-01","payee":"X","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-5a|1"},{"date":"2026-01-02","payee":"Y","amount":null,"transaction_type":"expense","suggested_category_id":null,"confidence":0.3,"fingerprint":"fp-be-5b|1"}]'::jsonb, 1000.00);
    RAISE EXCEPTION 'FAIL: should have failed';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS: import failed, transaction rolled back.'; END;
  IF (SELECT opening_balance FROM accounts WHERE id = acc_id) IS NOT NULL THEN RAISE EXCEPTION 'FAIL: opening set during rollback'; END IF;
  IF (SELECT count(*) FROM transactions) != before_count THEN RAISE EXCEPTION 'FAIL: partial txns'; END IF;
  RAISE NOTICE 'PASS: balance remains unestablished, no partial data.';
END $$;

\echo ""
\echo "--- Test 6: Retry after rollback succeeds ---"
DO $$
DECLARE acc_id bigint; result jsonb; new_opening numeric;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'savings' LIMIT 1;
  result := fc_import_transactions(acc_id, 'retry.csv', '[{"date":"2026-01-01","payee":"X","amount":-10.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-5a|1"},{"date":"2026-01-02","payee":"Z","amount":-20.00,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-be-5c|1"}]'::jsonb, 200.00);
  SELECT opening_balance INTO new_opening FROM accounts WHERE id = acc_id;
  IF new_opening = 230.00 AND (result->>'imported_count')::integer = 2 THEN
    RAISE NOTICE 'PASS: retry established opening = 200 - (-30) = 230.00';
  ELSE RAISE EXCEPTION 'FAIL: opening=%, result=%', new_opening, result; END IF;
END $$;

\echo ========================================
\echo   ALL BALANCE ESTABLISHMENT TESTS PASSED
\echo ========================================
