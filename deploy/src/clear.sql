-- ================================================================
-- phase: clear
-- Removes all transactional data. Runs after preflight, before migration.
-- ================================================================

\echo '--- Clearing transactional data ---'

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

-- Set opening balances to explicitly confirmed values
UPDATE accounts SET opening_balance = NULLIF('{{CHECKING_OPENING_BALANCE}}', 'UNSET')::numeric WHERE type = 'checking';
UPDATE accounts SET opening_balance = NULLIF('{{SAVINGS_OPENING_BALANCE}}',  'UNSET')::numeric WHERE type = 'savings';
UPDATE accounts SET opening_balance = NULLIF('{{CASH_OPENING_BALANCE}}',     'UNSET')::numeric WHERE type = 'cash';

-- Reset current balances to opening balances
UPDATE accounts SET current_balance = opening_balance, updated_at = now();

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
