-- ================================================================
-- phase: verify
-- Post-deployment assertions. Must all pass before COMMIT.
-- ================================================================

\echo '--- Verifying post-deployment state ---'

DO $$
DECLARE
    r record;
BEGIN
    -- 1. All transactional tables must be zero
    IF (SELECT count(*) FROM transactions) != 0 THEN
        RAISE EXCEPTION 'FAIL: % transactions remain', (SELECT count(*) FROM transactions);
    END IF;
    IF (SELECT count(*) FROM transaction_splits) != 0 THEN
        RAISE EXCEPTION 'FAIL: % splits remain', (SELECT count(*) FROM transaction_splits);
    END IF;
    IF (SELECT count(*) FROM transaction_attachments) != 0 THEN
        RAISE EXCEPTION 'FAIL: % attachments remain', (SELECT count(*) FROM transaction_attachments);
    END IF;
    IF (SELECT count(*) FROM reconciliations) != 0 THEN
        RAISE EXCEPTION 'FAIL: % reconciliations remain', (SELECT count(*) FROM reconciliations);
    END IF;
    IF (SELECT count(*) FROM import_history) != 0 THEN
        RAISE EXCEPTION 'FAIL: % import_history rows remain', (SELECT count(*) FROM import_history);
    END IF;
    RAISE NOTICE 'PASS: all transactional tables empty (transactions=0, splits=0, attachments=0, reconciliations=0, import_history=0).';

    -- 2. Zero fingerprints and import references
    IF (SELECT count(*) FROM transactions WHERE fingerprint IS NOT NULL) != 0 THEN
        RAISE EXCEPTION 'FAIL: fingerprints exist after clear';
    END IF;
    IF (SELECT count(*) FROM transactions WHERE import_id IS NOT NULL) != 0 THEN
        RAISE EXCEPTION 'FAIL: import references exist after clear';
    END IF;
    RAISE NOTICE 'PASS: zero fingerprints, zero import references.';

    -- 3. Exactly 3 accounts preserved with same IDs, names, types
    FOR r IN SELECT * FROM _pre_reset_accounts ORDER BY id LOOP
        IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = r.id AND name = r.name AND type = r.type) THEN
            RAISE EXCEPTION 'FAIL: account id=% name=% type=% was lost or altered.', r.id, r.name, r.type;
        END IF;
        IF (SELECT opening_balance FROM accounts WHERE id = r.id) IS DISTINCT FROM (SELECT opening_balance FROM _pre_reset_accounts WHERE id = r.id) THEN
            RAISE NOTICE 'INFO: account % opening balance changed from % to %', r.name, r.opening_balance, (SELECT opening_balance FROM accounts WHERE id = r.id);
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM accounts) != 3 THEN
        RAISE EXCEPTION 'FAIL: account count changed to %', (SELECT count(*) FROM accounts);
    END IF;
    RAISE NOTICE 'PASS: all 3 accounts preserved with exact IDs, names, and types.';

    -- 4. Categories and subcategories preserved
    IF (SELECT count(*) FROM categories) != (SELECT count(*) FROM _pre_reset_categories) THEN
        RAISE EXCEPTION 'FAIL: category count changed';
    END IF;
    IF (SELECT count(*) FROM subcategories) != (SELECT count(*) FROM _pre_reset_subs) THEN
        RAISE EXCEPTION 'FAIL: subcategory count changed';
    END IF;
    RAISE NOTICE 'PASS: categories (%) and subcategories (%) preserved.',
        (SELECT count(*) FROM categories), (SELECT count(*) FROM subcategories);

    -- 5. Both owners enrolled
    IF (SELECT count(*) FROM fc_members) != 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 fc_members, found %', (SELECT count(*) FROM fc_members);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{PHIL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Phil missing from fc_members';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{CRYSTAL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Crystal missing from fc_members';
    END IF;
    RAISE NOTICE 'PASS: both owners enrolled in fc_members.';

    -- 6. Opening balances are NULL (balance not yet established)
    --    Balances are set atomically during the first PNC import.
    FOR r IN SELECT name, opening_balance, current_balance FROM accounts LOOP
        IF r.opening_balance IS NOT NULL THEN
            RAISE EXCEPTION 'FAIL: % opening_balance should be NULL (balance not yet established), got %', r.name, r.opening_balance;
        END IF;
        IF r.current_balance != 0 THEN
            RAISE EXCEPTION 'FAIL: % current_balance should be 0, got %', r.name, r.current_balance;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: all accounts in balance-not-established state (opening=NULL, current=0).';

    -- 7. RLS on all FC tables
    IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true AND tablename = ANY(ARRAY[
        'accounts','categories','subcategories','transactions','merchant_memory','scheduled_transactions',
        'transaction_splits','transaction_attachments','reconciliations','import_history','import_profiles','fc_members'
    ])) < 12 THEN
        RAISE EXCEPTION 'FAIL: RLS not enabled on all FC tables';
    END IF;
    RAISE NOTICE 'PASS: RLS enabled on all FC tables.';

    -- 8. Schema artifacts present
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_trans_fingerprint') THEN
        RAISE EXCEPTION 'FAIL: fingerprint unique constraint missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_history') THEN
        RAISE EXCEPTION 'FAIL: import_history missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'fc_import_transactions') THEN
        RAISE EXCEPTION 'FAIL: fc_import_transactions missing';
    END IF;
    RAISE NOTICE 'PASS: fingerprint constraint, import tables, and RPC all present.';
END $$;

-- Cleanup temp tables
DROP TABLE IF EXISTS _pre_reset_accounts;
DROP TABLE IF EXISTS _pre_reset_categories;
DROP TABLE IF EXISTS _pre_reset_subs;
DROP TABLE IF EXISTS _pre_reset_trans_count;
