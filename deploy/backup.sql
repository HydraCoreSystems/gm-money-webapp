-- ================================================================
-- Pre-Reset Production Backup
-- Run BEFORE deploy/production-reset.sql in Supabase SQL Editor.
-- Saves all Financial Center data that will be cleared or altered.
-- ================================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'fc_backup') THEN
        RAISE EXCEPTION 'Backup schema fc_backup already exists. Refusing to overwrite the existing recovery copy.';
    END IF;
END $$;

CREATE SCHEMA fc_backup;

-- Accounts (preserved but backed up for safety)
CREATE TABLE fc_backup.accounts AS SELECT *, now() AS backed_up_at FROM accounts;

-- Categories and subcategories
CREATE TABLE fc_backup.categories AS SELECT *, now() AS backed_up_at FROM categories;
CREATE TABLE fc_backup.subcategories AS SELECT *, now() AS backed_up_at FROM subcategories;

-- Transactional data (will be cleared)
CREATE TABLE fc_backup.transactions AS SELECT *, now() AS backed_up_at FROM transactions;

CREATE TABLE fc_backup.transaction_splits AS SELECT *, now() AS backed_up_at FROM transaction_splits;

CREATE TABLE fc_backup.transaction_attachments AS SELECT *, now() AS backed_up_at FROM transaction_attachments;

CREATE TABLE fc_backup.reconciliations AS SELECT *, now() AS backed_up_at FROM reconciliations;

-- Import history (may not exist yet)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
        EXECUTE 'CREATE TABLE fc_backup.import_history AS SELECT *, now() AS backed_up_at FROM import_history';
    END IF;
END $$;

-- Merchant memory and scheduled (currently empty, backed up for safety)
CREATE TABLE fc_backup.merchant_memory AS SELECT *, now() AS backed_up_at FROM merchant_memory;
CREATE TABLE fc_backup.scheduled_transactions AS SELECT *, now() AS backed_up_at FROM scheduled_transactions;

-- Snapshot grants/policies for the public schema (informational)
CREATE TABLE fc_backup.grants AS
SELECT
    c.relname AS table_name,
    (aclexplode(c.relacl)).grantee::regrole::text AS grantee,
    (aclexplode(c.relacl)).privilege_type AS privilege
FROM pg_class c
WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
    AND c.relname IN (
        'accounts','categories','subcategories','transactions','merchant_memory',
        'scheduled_transactions','transaction_splits','transaction_attachments',
        'reconciliations'
    );

-- Verification
DO $$
DECLARE
    acc_count integer;
    trans_count integer;
BEGIN
    SELECT count(*) INTO acc_count   FROM fc_backup.accounts;
    SELECT count(*) INTO trans_count FROM fc_backup.transactions;

    RAISE NOTICE '========================================';
    RAISE NOTICE '  BACKUP VERIFICATION';
    RAISE NOTICE '  accounts:      %', acc_count;
    RAISE NOTICE '  categories:    %', (SELECT count(*) FROM fc_backup.categories);
    RAISE NOTICE '  subcategories: %', (SELECT count(*) FROM fc_backup.subcategories);
    RAISE NOTICE '  transactions:  %', trans_count;
    RAISE NOTICE '  splits:        %', (SELECT count(*) FROM fc_backup.transaction_splits);
    RAISE NOTICE '  attachments:   %', (SELECT count(*) FROM fc_backup.transaction_attachments);
    RAISE NOTICE '  reconciliations: %', (SELECT count(*) FROM fc_backup.reconciliations);
    RAISE NOTICE '========================================';

    IF acc_count != 3 THEN
        RAISE EXCEPTION 'FAIL: backup must contain exactly 3 accounts; found %', acc_count;
    END IF;
    IF trans_count != 26 THEN
        RAISE EXCEPTION 'FAIL: expected the audited 26 pre-reset transactions; found %. Stop and investigate before reset.', trans_count;
    END IF;
    RAISE NOTICE 'Backup successful. All data saved in schema fc_backup.';
END $$;

COMMIT;

-- ================================================================
-- Restore only with deploy/restore.sql, and only if the reset must be reversed.
-- ================================================================
