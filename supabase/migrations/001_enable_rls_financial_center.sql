-- ============================================================================
-- Gathering Moss Financial Center: Unified Schema, Owner-Only RLS & Atomic Import
-- Repeatable — safe to run multiple times. Does not touch unrelated tables.
-- ============================================================================

-- ============================================================================
-- 1. FINANCIAL CENTER MEMBERSHIP TABLE
--    SELECT: members read own row only (user_id = auth.uid()) — no recursion
--    No INSERT / UPDATE / DELETE policies (service_role / dashboard only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fc_members (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'owner',
  added_by  uuid,
  added_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fc_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own row" ON fc_members;
CREATE POLICY "Members read own row" ON fc_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- 2. SCHEMA EXTENSIONS (idempotent column additions)
--    fingerprint unique constraint is MANDATORY — aborts on existing duplicates
-- ============================================================================

DO $$
DECLARE
  dup_count integer;
  dup_report text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'fingerprint'
  ) THEN
    ALTER TABLE transactions ADD COLUMN fingerprint text;
  END IF;

  -- Audit existing duplicates. If any exist, abort with a reporting query.
  SELECT count(*) INTO dup_count FROM (
    SELECT fingerprint FROM transactions
    WHERE fingerprint IS NOT NULL
    GROUP BY fingerprint HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % duplicate fingerprint(s) exist in transactions.'
      '  Run this query to list them, resolve manually, then re-run the migration:'
      '  SELECT fingerprint, count(*) AS occurrences, array_agg(id ORDER BY id) AS transaction_ids'
      '  FROM transactions WHERE fingerprint IS NOT NULL'
      '  GROUP BY fingerprint HAVING count(*) > 1 ORDER BY fingerprint;',
      dup_count;
  END IF;

  -- Safe to add the constraint — always, whether column was just created or existed previously
  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS uq_trans_fingerprint;
  ALTER TABLE transactions ADD CONSTRAINT uq_trans_fingerprint UNIQUE (fingerprint);

  RAISE NOTICE 'Fingerprint unique constraint uq_trans_fingerprint applied successfully.';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'import_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN import_id bigint;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trans_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_trans_review ON transactions(review_status);
CREATE INDEX IF NOT EXISTS idx_trans_fingerprint ON transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_trans_import_id ON transactions(import_id);

-- ============================================================================
-- 3. IMPORT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_profiles (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name            text NOT NULL UNIQUE,
  institution     text,
  date_format     text DEFAULT 'YYYY-MM-DD',
  has_header      integer DEFAULT 1,
  column_mappings jsonb NOT NULL DEFAULT '{}',
  amount_format   jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_history (
  id                     bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  filename               text NOT NULL,
  file_hash              text,
  import_date            timestamptz NOT NULL DEFAULT now(),
  account_id             bigint,
  profile_id             bigint,
  total_rows             integer DEFAULT 0,
  new_count              integer DEFAULT 0,
  duplicate_count        integer DEFAULT 0,
  error_count            integer DEFAULT 0,
  review_required_count  integer DEFAULT 0,
  status                 text DEFAULT 'completed'
);

CREATE INDEX IF NOT EXISTS idx_import_history_account ON import_history(account_id);
CREATE INDEX IF NOT EXISTS idx_import_history_date ON import_history(import_date DESC);

-- ============================================================================
-- 4. FOREIGN KEYS (type-safe)
-- ============================================================================

DO $$
DECLARE
  acc_id_type text;
  imp_id_type text;
  trans_imp_type text;
BEGIN
  SELECT data_type INTO acc_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'id';
  SELECT data_type INTO imp_id_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_profiles' AND column_name = 'id';
  SELECT data_type INTO trans_imp_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'id';

  IF acc_id_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE import_history DROP CONSTRAINT IF EXISTS fk_import_history_account_id;
    ALTER TABLE import_history ADD CONSTRAINT fk_import_history_account_id
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
  END IF;

  IF imp_id_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE import_history DROP CONSTRAINT IF EXISTS fk_import_history_profile_id;
    ALTER TABLE import_history ADD CONSTRAINT fk_import_history_profile_id
      FOREIGN KEY (profile_id) REFERENCES import_profiles(id) ON DELETE SET NULL;
  END IF;

  IF trans_imp_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'import_id'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_import_id;
    ALTER TABLE transactions ADD CONSTRAINT fk_transactions_import_id
      FOREIGN KEY (import_id) REFERENCES import_history(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 5. ROW-LEVEL SECURITY — TO authenticated belt-and-suspenders + fc_members gate
-- ============================================================================

CREATE OR REPLACE FUNCTION fc_apply_rls(target_table text) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = target_table) THEN
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fc_create_policy(target_table text, policy_name text, operation text) RETURNS void AS $$
DECLARE
  tbl_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = target_table) INTO tbl_exists;
  IF NOT tbl_exists THEN RETURN; END IF;

  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, target_table);

  IF operation = 'SELECT' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'INSERT' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'UPDATE' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'DELETE' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  END IF;
END $$ LANGUAGE plpgsql;

-- Apply to all Financial Center tables
SELECT fc_apply_rls(t) FROM unnest(ARRAY[
  'accounts','categories','subcategories','transactions','merchant_memory',
  'scheduled_transactions','transaction_splits','transaction_attachments',
  'reconciliations','import_history','import_profiles'
]) t;

SELECT fc_create_policy(t, 'FC members can select ' || t, 'SELECT')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

SELECT fc_create_policy(t, 'FC members can insert ' || t, 'INSERT')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

SELECT fc_create_policy(t, 'FC members can update ' || t, 'UPDATE')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

SELECT fc_create_policy(t, 'FC members can delete ' || t, 'DELETE')
  FROM unnest(ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ]) t;

-- Cleanup helper functions
DROP FUNCTION IF EXISTS fc_apply_rls(text);
DROP FUNCTION IF EXISTS fc_create_policy(text, text, text);

-- ============================================================================
-- 6. ATOMIC IMPORT RPC
--    Serializes per-account via FOR UPDATE. Uses ON CONFLICT for dedup safety.
--    Rejects null/blank/invalid fingerprints. Entire import is one transaction.
--    SECURITY INVOKER with locked-down search_path and execute-only-by-authenticated.
-- ============================================================================

CREATE OR REPLACE FUNCTION fc_import_transactions(
  p_account_id  bigint,
  p_filename    text,
  p_transactions jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hist_id      bigint;
  v_total_rows   integer;
  v_imported     integer := 0;
  v_duplicates   integer := 0;
  v_review       integer := 0;
  v_row          jsonb;
  v_fingerprint  text;
  v_inserted_id  bigint;
  v_review_stat  text;
  v_category_id  bigint;
  v_subcategory_id bigint;
  v_account_exists boolean;
  result         jsonb;
BEGIN
  v_total_rows := jsonb_array_length(p_transactions);

  IF v_total_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'import_id', null,
      'imported_count', 0,
      'duplicate_count', 0,
      'review_required_count', 0
    );
  END IF;

  -- 1. Lock account row and verify it exists
  PERFORM id FROM accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account % does not exist.', p_account_id;
  END IF;

  -- 2. Validate every fingerprint before writing anything
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_fingerprint := v_row ->> 'fingerprint';
    IF v_fingerprint IS NULL OR trim(v_fingerprint) = '' THEN
      RAISE EXCEPTION 'Rejected: row % has null or blank fingerprint. Every import row requires a valid fingerprint.',
        (v_row ->> 'date');
    END IF;
    IF length(v_fingerprint) < 8 THEN
      RAISE EXCEPTION 'Rejected: fingerprint "%" is too short (must be at least 8 chars).', v_fingerprint;
    END IF;
  END LOOP;

  -- 3. Create import history record
  INSERT INTO import_history (filename, account_id, total_rows, new_count, duplicate_count, status)
  VALUES (p_filename, p_account_id, v_total_rows, 0, 0, 'in_progress')
  RETURNING id INTO v_hist_id;

  -- 4. Insert each accepted transaction — ON CONFLICT is the only dedup gate
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_fingerprint := v_row ->> 'fingerprint';

    -- Determine review status and category (mutually exclusive)
    IF (v_row ->> 'confidence')::numeric >= 0.7
       AND v_row ->> 'suggested_category_id' IS NOT NULL
    THEN
      v_review_stat := 'approved';
      v_category_id := (v_row ->> 'suggested_category_id')::bigint;
      v_subcategory_id := NULLIF(v_row ->> 'suggested_subcategory_id', '')::bigint;
    ELSE
      v_review_stat := 'pending_review';
      v_category_id := NULL;
      v_subcategory_id := NULL;
    END IF;

    INSERT INTO transactions (
      account_id, date, payee, original_description, amount,
      transaction_type, category_id, subcategory_id,
      review_status, cleared_status, import_id, fingerprint
    ) VALUES (
      p_account_id,
      COALESCE(v_row ->> 'date', current_date::text),
      (v_row ->> 'payee'),
      COALESCE(v_row ->> 'original_description', v_row ->> 'payee'),
      (v_row ->> 'amount')::numeric,
      COALESCE(v_row ->> 'transaction_type',
        CASE WHEN (v_row ->> 'amount')::numeric >= 0 THEN 'income' ELSE 'expense' END),
      v_category_id,
      v_subcategory_id,
      v_review_stat,
      'uncleared',
      v_hist_id,
      v_fingerprint
    )
    ON CONFLICT (fingerprint) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NOT NULL THEN
      v_imported := v_imported + 1;
      IF v_review_stat = 'pending_review' THEN
        v_review := v_review + 1;
      END IF;
    ELSE
      v_duplicates := v_duplicates + 1;
    END IF;
  END LOOP;

  -- 5. Update import history with final counts
  UPDATE import_history
  SET new_count = v_imported,
      duplicate_count = v_duplicates,
      review_required_count = v_review,
      status = 'completed'
  WHERE id = v_hist_id;

  -- 6. Recalculate account balance
  UPDATE accounts
  SET current_balance = (
    SELECT COALESCE(opening_balance, 0) + COALESCE(
      (SELECT sum(amount) FROM transactions
       WHERE account_id = p_account_id AND review_status = 'approved'), 0
    )
  )
  WHERE id = p_account_id;

  result := jsonb_build_object(
    'success', true,
    'import_id', v_hist_id,
    'imported_count', v_imported,
    'duplicate_count', v_duplicates,
    'review_required_count', v_review
  );

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END $$;

-- Lock down the RPC: only authenticated role may execute
DO $$
BEGIN
  REVOKE ALL ON FUNCTION fc_import_transactions(bigint,text,jsonb) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION fc_import_transactions(bigint,text,jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION fc_import_transactions(bigint,text,jsonb) TO authenticated;
  END IF;
END $$;

-- ============================================================================
-- 7. DATA API PRIVILEGES
--    authenticated: minimum required for app (RLS + fc_members gates access)
--    anon / PUBLIC: no access to FC tables or sequences
-- ============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      -- Allow authenticated to use these tables (RLS gates actual row access)
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', tbl);
      -- Deny anon completely
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON %I FROM anon', tbl);
      END IF;
      -- Deny PUBLIC completely
      EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', tbl);
    END IF;
  END LOOP;

  -- Also revoke on fc_members (already has no client policies, this is belt-and-suspenders)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fc_members') THEN
    GRANT SELECT ON fc_members TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON fc_members FROM authenticated;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON fc_members FROM anon;
    END IF;
    REVOKE ALL ON fc_members FROM PUBLIC;
  END IF;

  -- Sequence usage for identity columns
  EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC';
END $$;

-- ============================================================================
-- 8. ENROLLMENT (run manually in Supabase Dashboard SQL Editor)
-- ============================================================================
--   INSERT INTO fc_members (user_id, role) VALUES ('<phil-uuid>', 'owner');
--   INSERT INTO fc_members (user_id, role) VALUES ('<crystal-uuid>', 'owner');

-- ============================================================================
-- 8. VERIFICATION QUERIES
-- ============================================================================
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;
--   SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;
