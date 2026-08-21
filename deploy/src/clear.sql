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
