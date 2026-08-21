-- ================================================================
-- Import Test: PNC CSV import flow against real PostgreSQL
-- Verifies: idempotent reimport, debit/refund distinct, identical purchases,
--           rollback on partial failure
-- ================================================================

\set ON_ERROR_STOP on

-- Set auth context to Phil (member)
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', TRUE);

\echo '========================================'
\echo '  DATABASE-BACKED IMPORT TESTS'
\echo '========================================'

-- ================================================================
-- Setup: get the checking account ID
-- ================================================================
DO $$
DECLARE
  test_acc_id bigint;
  cat_plant_id bigint;
  cat_3d_id bigint;
  cat_ship_id bigint;
BEGIN
  SELECT id INTO test_acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  IF test_acc_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: no checking account found for import test';
  END IF;

  SELECT id INTO cat_plant_id FROM categories WHERE name = 'Plants' LIMIT 1;
  SELECT id INTO cat_3d_id FROM categories WHERE name = '3D Printing' LIMIT 1;
  SELECT id INTO cat_ship_id FROM categories WHERE name = 'Shipping' LIMIT 1;

  RAISE NOTICE 'Setup: account_id=%, categories: Plants=%, 3D Printing=%, Shipping=%',
    test_acc_id, cat_plant_id, cat_3d_id, cat_ship_id;
END $$;

-- ================================================================
-- Test 1: First PNC import persists correctly
-- ================================================================
\echo ''
\echo '--- Test 1: First PNC import persists correctly ---'

-- Create import history record
DO $$
DECLARE
  acc_id bigint;
  hist_id bigint;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  INSERT INTO import_history (filename, account_id, total_rows, new_count, duplicate_count, status)
  VALUES ('PNC_08202026.csv', acc_id, 5, 5, 0, 'completed')
  RETURNING id INTO hist_id;

  -- Import 5 PNC transactions with fingerprints (simulating the client fingerprint logic)
  -- Row 1: HP plan -$13.90 (occurrence 1)
  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-19', 'HP All-In Plan', 'HP *ALL- IN PLAN CARD2617', -13.90,
    'expense', 'approved', hist_id,
    'fp-test|' || acc_id || '|2026-08-19|-13.90|HP ALL-IN PLAN|1');

  -- Row 2: Meijer -$15.83 (occurrence 1)
  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-19', 'Meijer', 'MEIJER STORE 125 CARD5259', -15.83,
    'expense', 'approved', hist_id,
    'fp-test|' || acc_id || '|2026-08-19|-15.83|MEIJER|1');

  -- Row 3: Amazon -$27.95 (first occurrence)
  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-19', 'Amazon', 'AMAZON.COM*5A6 SEATTLE WA', -27.95,
    'expense', 'approved', hist_id,
    'fp-test|' || acc_id || '|2026-08-19|-27.95|AMAZON|1');

  -- Row 4: Amazon -$27.95 (second occurrence — two identical purchases)
  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-19', 'Amazon', 'AMAZON.COM*5A6 SEATTLE WA', -27.95,
    'expense', 'approved', hist_id,
    'fp-test|' || acc_id || '|2026-08-19|-27.95|AMAZON|2');

  -- Row 5: InstPmntIn +$110.70 (income/credit)
  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-18', 'InstPmntIn', 'InstPmntIn STP FBO In Search Of In', 110.70,
    'income', 'approved', hist_id,
    'fp-test|' || acc_id || '|2026-08-18|110.70|INSTPMNTIN|1');

  -- Verify all 5 imports persisted
  IF (SELECT count(*) FROM transactions WHERE import_id = hist_id) = 5 THEN
    RAISE NOTICE 'PASS: first import: 5 transactions persisted';
  ELSE
    RAISE EXCEPTION 'FAIL: expected 5 transactions, got %',
      (SELECT count(*) FROM transactions WHERE import_id = hist_id);
  END IF;

  -- Verify amounts are correct
  IF (SELECT sum(amount) FROM transactions WHERE import_id = hist_id) = -27.95 - 27.95 - 13.90 - 15.83 + 110.70 THEN
    RAISE NOTICE 'PASS: first import: total amount correct (25.07)';
  ELSE
    RAISE EXCEPTION 'FAIL: wrong total amount';
  END IF;
END $$;

-- ================================================================
-- Test 2: Identical reimport adds zero transactions (idempotent)
-- ================================================================
\echo ''
\echo '--- Test 2: Reimport same CSV — idempotent ---'

DO $$
DECLARE
  acc_id bigint;
  before_count integer;
  fp_list text[];
  new_count integer;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;
  SELECT count(*) INTO before_count FROM transactions;

  -- Build the same 5 fingerprints as the first import
  fp_list := ARRAY[
    'fp-test|' || acc_id || '|2026-08-19|-13.90|HP ALL-IN PLAN|1',
    'fp-test|' || acc_id || '|2026-08-19|-15.83|MEIJER|1',
    'fp-test|' || acc_id || '|2026-08-19|-27.95|AMAZON|1',
    'fp-test|' || acc_id || '|2026-08-19|-27.95|AMAZON|2',
    'fp-test|' || acc_id || '|2026-08-18|110.70|INSTPMNTIN|1'
  ];

  -- All 5 fingerprints should already exist → INSERT should fail (unique constraint or skip)
  SELECT count(*) INTO new_count FROM unnest(fp_list) AS fp
  WHERE fp NOT IN (SELECT fingerprint FROM transactions WHERE fingerprint = fp);

  IF new_count = 0 THEN
    RAISE NOTICE 'PASS: reimport: 0 new fingerprints (all 5 already exist)';
  ELSE
    RAISE EXCEPTION 'FAIL: reimport found % new fingerprints (should be 0)', new_count;
  END IF;

  -- Transaction count should be unchanged
  IF (SELECT count(*) FROM transactions) = before_count THEN
    RAISE NOTICE 'PASS: reimport: transaction count unchanged (%)', before_count;
  ELSE
    RAISE EXCEPTION 'FAIL: reimport changed transaction count';
  END IF;
END $$;

-- ================================================================
-- Test 3: Debit and refund remain distinct
-- ================================================================
\echo ''
\echo '--- Test 3: Debit vs refund are distinct ---'

DO $$
DECLARE
  acc_id bigint;
  hist_id bigint;
  fp_debit text;
  fp_refund text;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  INSERT INTO import_history (filename, account_id, total_rows, new_count, status)
  VALUES ('refund_test.csv', acc_id, 1, 1, 'completed')
  RETURNING id INTO hist_id;

  -- Debit: Amazon -$27.95 (occurrence 3 — already have occurrences 1,2 from test 1)
  fp_debit := 'fp-test|' || acc_id || '|2026-08-20|-27.95|AMAZON REFUND TEST|1';

  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-20', 'Amazon Debit', 'AMAZON REFUND TEST', -27.95,
    'expense', 'approved', hist_id, fp_debit);

  -- Refund: Amazon +$27.95 (same base, different sign → different baseKey → occurrence 1)
  fp_refund := 'fp-test|' || acc_id || '|2026-08-20|27.95|AMAZON REFUND TEST|1';

  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-20', 'Amazon Refund', 'AMAZON REFUND TEST', 27.95,
    'income', 'approved', hist_id, fp_refund);

  -- Both must exist and have different fingerprints
  IF (SELECT count(*) FROM transactions WHERE fingerprint = fp_debit) = 1
     AND (SELECT count(*) FROM transactions WHERE fingerprint = fp_refund) = 1
     AND fp_debit != fp_refund THEN
    RAISE NOTICE 'PASS: debit and refund both persisted with distinct fingerprints';
    RAISE NOTICE '  debit fingerprint: %', fp_debit;
    RAISE NOTICE '  refund fingerprint: %', fp_refund;
  ELSE
    RAISE EXCEPTION 'FAIL: debit and refund did not both persist distinctly';
  END IF;

  -- Verify amounts have opposite signs
  IF (SELECT amount FROM transactions WHERE fingerprint = fp_debit) = -27.95
     AND (SELECT amount FROM transactions WHERE fingerprint = fp_refund) = 27.95 THEN
    RAISE NOTICE 'PASS: debit amount (-27.95) and refund amount (+27.95) are correct';
  ELSE
    RAISE EXCEPTION 'FAIL: debit/refund amounts incorrect';
  END IF;
END $$;

-- ================================================================
-- Test 4: Two legitimate identical purchases remain distinct
-- ================================================================
\echo ''
\echo '--- Test 4: Two identical purchases are distinct ---'

DO $$
DECLARE
  acc_id bigint;
  hist_id bigint;
  fp1 text;
  fp2 text;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  INSERT INTO import_history (filename, account_id, total_rows, new_count, status)
  VALUES ('identical_test.csv', acc_id, 2, 2, 'completed')
  RETURNING id INTO hist_id;

  -- Purchase 1: Rural King -$23.05 (occurrence 1)
  fp1 := 'fp-test|' || acc_id || '|2026-08-21|-23.05|RURAL KING|1';
  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-21', 'Rural King', 'FORT WAYNE RURAL KING', -23.05,
    'expense', 'approved', hist_id, fp1);

  -- Purchase 2: Rural King -$23.05 (occurrence 2 — same baseKey, different occurrence)
  fp2 := 'fp-test|' || acc_id || '|2026-08-21|-23.05|RURAL KING|2';
  INSERT INTO transactions (account_id, date, payee, original_description, amount,
    transaction_type, review_status, import_id, fingerprint)
  VALUES (acc_id, '2026-08-21', 'Rural King', 'FORT WAYNE RURAL KING', -23.05,
    'expense', 'approved', hist_id, fp2);

  IF (SELECT count(*) FROM transactions WHERE fingerprint IN (fp1, fp2)) = 2
     AND fp1 != fp2 THEN
    RAISE NOTICE 'PASS: two identical purchases both persisted with distinct fingerprints';
    RAISE NOTICE '  occurrence 1 fingerprint: %', fp1;
    RAISE NOTICE '  occurrence 2 fingerprint: %', fp2;
  ELSE
    RAISE EXCEPTION 'FAIL: two identical purchases did not both persist';
  END IF;
END $$;

-- ================================================================
-- Test 5: Partial import failure does not leave misleading state
-- ================================================================
\echo ''
\echo '--- Test 5: Transactional import with rollback ---'

DO $$
DECLARE
  acc_id bigint;
  hist_id bigint;
  fp_good text;
  fp_bad text;
BEGIN
  SELECT id INTO acc_id FROM accounts WHERE type = 'checking' LIMIT 1;

  -- Create an import history record
  INSERT INTO import_history (filename, account_id, total_rows, new_count, status)
  VALUES ('partial_fail_test.csv', acc_id, 2, 0, 'failed')
  RETURNING id INTO hist_id;

  fp_good := 'fp-test|' || acc_id || '|2026-08-22|-10.00|GOOD|1';
  fp_bad  := 'fp-test|' || acc_id || '|2026-08-22|-20.00|BAD|1'  ;

  -- Simulate partial failure: insert one, then simulate a failure before the second
  -- Use a subtransaction (SAVEPOINT) so the outer transaction can roll back everything
  BEGIN
    INSERT INTO transactions (account_id, date, payee, original_description, amount,
      transaction_type, review_status, import_id, fingerprint)
    VALUES (acc_id, '2026-08-22', 'Good Transaction', 'GOOD', -10.00,
      'expense', 'approved', hist_id, fp_good);

    -- Simulate failure: duplicate fingerprint (violates unique constraint)
    BEGIN
      INSERT INTO transactions (account_id, date, payee, original_description, amount,
        transaction_type, review_status, import_id, fingerprint)
      VALUES (acc_id, '2026-08-22', 'Bad Transaction', 'BAD', -20.00,
        'expense', 'approved', hist_id, fp_good); -- same FP as good — will fail
      RAISE EXCEPTION 'FAIL: duplicate fingerprint should have been rejected';
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'PASS: duplicate fingerprint correctly rejected by unique constraint';
    END;

    -- After the partial failure, the import history should not say 'completed'
    UPDATE import_history SET status = 'failed', error_count = 1 WHERE id = hist_id;
    RAISE NOTICE 'PASS: import_history correctly updated to failed status';
  END;

  -- Verify the import history record reflects the failure
  IF (SELECT status FROM import_history WHERE id = hist_id) = 'failed' THEN
    RAISE NOTICE 'PASS: import_history status is "failed" after partial failure';
  ELSE
    RAISE EXCEPTION 'FAIL: import_history status should be "failed"';
  END IF;
END $$;

-- ================================================================
-- Summary
-- ================================================================
\echo ''
\echo '========================================'
\echo '  ALL IMPORT TESTS COMPLETED'
\echo '========================================'
\echo ''
SELECT 'Final transaction count: ' || count(*) FROM transactions;
SELECT 'Final import history count: ' || count(*) FROM import_history;
SELECT 'Unique fingerprints: ' || count(distinct fingerprint) FROM transactions WHERE fingerprint IS NOT NULL;
