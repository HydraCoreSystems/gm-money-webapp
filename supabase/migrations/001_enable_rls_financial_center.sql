-- ============================================================================
-- Gathering Moss Financial Center: Unified Schema & Owner-Only RLS Migration
-- Repeatable — safe to run multiple times. Does not touch unrelated tables.
-- ============================================================================

-- ============================================================================
-- 1. FINANCIAL CENTER MEMBERSHIP TABLE
--    SELECT: members read own row only (user_id = auth.uid()) — no recursion
--    INSERT / UPDATE / DELETE: no browser-client policies (service_role / dashboard only)
--    Enrollment: INSERT via Supabase Dashboard SQL Editor (service_role bypasses RLS)
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
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================================
-- 2. SCHEMA EXTENSIONS (idempotent column additions)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'fingerprint'
  ) THEN
    ALTER TABLE transactions ADD COLUMN fingerprint text;
    ALTER TABLE transactions ADD CONSTRAINT uq_trans_fingerprint UNIQUE (fingerprint);
  END IF;
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
-- 4. FOREIGN KEYS (type-safe: checks column type before adding)
--    ON DELETE RESTRICT:  cannot accidentally cascade-delete financial data
--    ON DELETE SET NULL:  removing a profile or import record does not delete transactions
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

  -- import_history.account_id → accounts.id (RESTRICT: cannot delete account with import history)
  IF acc_id_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE import_history DROP CONSTRAINT IF EXISTS fk_import_history_account_id;
    ALTER TABLE import_history ADD CONSTRAINT fk_import_history_account_id
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
  END IF;

  -- import_history.profile_id → import_profiles.id (SET NULL: deleting profile nullifies reference)
  IF imp_id_type IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'import_history' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE import_history DROP CONSTRAINT IF EXISTS fk_import_history_profile_id;
    ALTER TABLE import_history ADD CONSTRAINT fk_import_history_profile_id
      FOREIGN KEY (profile_id) REFERENCES import_profiles(id) ON DELETE SET NULL;
  END IF;

  -- transactions.import_id → import_history.id (SET NULL: deleting import history leaves transactions intact)
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
-- 5. ROW-LEVEL SECURITY — every Financial Center table (table-existence guarded)
--    Each block is wrapped in DO ... IF EXISTS so missing legacy tables don't fail.
-- ============================================================================

-- Helper: applies policies to a table if it exists
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
      'CREATE POLICY %I ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'INSERT' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'UPDATE' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
      policy_name, target_table
    );
  ELSIF operation = 'DELETE' THEN
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE fc_members.user_id = auth.uid()))',
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

-- Cleanup functions (no longer needed after policy creation)
DROP FUNCTION IF EXISTS fc_apply_rls(text);
DROP FUNCTION IF EXISTS fc_create_policy(text, text, text);

-- ============================================================================
-- 6. ENROLLMENT (run manually in Supabase Dashboard SQL Editor)
-- ============================================================================
-- Find Phil and Crystal's UUIDs in Supabase Dashboard → Authentication → Users
-- Then:
--   INSERT INTO fc_members (user_id, role) VALUES ('<phil-uuid>', 'owner');
--   INSERT INTO fc_members (user_id, role) VALUES ('<crystal-uuid>', 'owner');
-- No browser-client policy allows INSERT on fc_members — dashboard/service_role only.

-- ============================================================================
-- 7. VERIFICATION (run after migration + enrollment)
-- ============================================================================
-- RLS-enabled tables:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true ORDER BY tablename;
-- Policies summary:
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;
-- Foreign keys:
--   SELECT conname, conrelid::regclass AS tbl, confrelid::regclass AS ref_tbl, confupdtype, confdeltype
--   FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text LIKE 'import_%' OR conrelid::regclass::text = 'transactions';
