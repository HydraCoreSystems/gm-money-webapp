-- ================================================================
-- phase: preflight
-- Validates environment, owner UUIDs, opening balances, account state
-- before any destructive operation. Runs first in the transaction.
-- ================================================================

-- ================================================================
-- 1. Validate owner UUIDs
-- ================================================================
DO $$
DECLARE
    phil_id    uuid := '{{PHIL_UUID}}'::uuid;
    crystal_id uuid := '{{CRYSTAL_UUID}}'::uuid;
    phil_exists    boolean;
    crystal_exists boolean;
BEGIN
    -- Reject placeholder values
    IF phil_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR crystal_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR phil_id = crystal_id
    THEN
        RAISE EXCEPTION 'UUID validation failed: Phil and Crystal UUIDs must be replaced with actual auth.users UUIDs. Both must be distinct. Both must not be the zero UUID.';
    END IF;

    -- Verify both exist in auth.users
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = phil_id) INTO phil_exists;
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = crystal_id) INTO crystal_exists;

    IF NOT phil_exists THEN
        RAISE EXCEPTION 'Phil UUID % not found in auth.users.', phil_id;
    END IF;
    IF NOT crystal_exists THEN
        RAISE EXCEPTION 'Crystal UUID % not found in auth.users.', crystal_id;
    END IF;

    RAISE NOTICE 'Owner UUIDs validated: Phil=%, Crystal=%', phil_id, crystal_id;
END $$;

-- ================================================================
-- 2. Validate opening balances
-- ================================================================
DO $$
DECLARE
    chk_bal numeric := NULLIF('{{CHECKING_OPENING_BALANCE}}', 'UNSET');
    sav_bal numeric := NULLIF('{{SAVINGS_OPENING_BALANCE}}', 'UNSET');
    csh_bal numeric := NULLIF('{{CASH_OPENING_BALANCE}}', 'UNSET');
BEGIN
    IF chk_bal IS NULL THEN
        RAISE EXCEPTION 'CHECKING_OPENING_BALANCE is UNSET. Replace with the intended value (0.00 is acceptable only if explicitly chosen).';
    END IF;
    IF sav_bal IS NULL THEN
        RAISE EXCEPTION 'SAVINGS_OPENING_BALANCE is UNSET. Replace with the intended value.';
    END IF;
    IF csh_bal IS NULL THEN
        RAISE EXCEPTION 'CASH_OPENING_BALANCE is UNSET. Replace with the intended value.';
    END IF;

    RAISE NOTICE 'Opening balances confirmed: checking=%, savings=%, cash=%', chk_bal, sav_bal, csh_bal;
END $$;

-- ================================================================
-- 3. Verify exactly three accounts: 1 checking, 1 savings, 1 cash, no extras
-- ================================================================
DO $$
DECLARE
    chk_count integer;
    sav_count integer;
    csh_count integer;
    total     integer;
BEGIN
    SELECT count(*) INTO chk_count FROM accounts WHERE type = 'checking';
    SELECT count(*) INTO sav_count FROM accounts WHERE type = 'savings';
    SELECT count(*) INTO csh_count FROM accounts WHERE type = 'cash';
    SELECT count(*) INTO total     FROM accounts;

    IF total != 3 THEN
        RAISE EXCEPTION 'Expected exactly 3 accounts, found %.', total;
    END IF;
    IF chk_count != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 checking account, found %.', chk_count;
    END IF;
    IF sav_count != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 savings account, found %.', sav_count;
    END IF;
    IF csh_count != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 cash account, found %.', csh_count;
    END IF;

    RAISE NOTICE 'Accounts verified: 1 checking, 1 savings, 1 cash, 3 total.';
END $$;

-- ================================================================
-- 4. Capture pre-reset state for post-verification
-- ================================================================
CREATE TEMP TABLE _pre_reset_accounts    AS SELECT * FROM accounts;
CREATE TEMP TABLE _pre_reset_categories  AS SELECT * FROM categories;
CREATE TEMP TABLE _pre_reset_subs        AS SELECT * FROM subcategories;
CREATE TEMP TABLE _pre_reset_trans_count AS SELECT count(*) AS cnt FROM transactions;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT name, type, opening_balance, current_balance FROM _pre_reset_accounts ORDER BY id LOOP
        RAISE NOTICE '  Account: % (%) opening=%, current=%', r.name, r.type, r.opening_balance, r.current_balance;
    END LOOP;
    RAISE NOTICE 'Pre-reset: % transactions, % categories, % subcategories',
        (SELECT cnt FROM _pre_reset_trans_count),
        (SELECT count(*) FROM _pre_reset_categories),
        (SELECT count(*) FROM _pre_reset_subs);
END $$;
