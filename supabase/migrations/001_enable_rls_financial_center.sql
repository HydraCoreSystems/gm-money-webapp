-- ============================================================================
-- Gathering Moss Financial Center: Unified Schema & RLS Migration
-- Repeatable — safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- Supabase project: skrybix (shared PostgreSQL)
-- Target:     Financial Center tables only. Unrelated Skrybix tables untouched.
-- Access:     Owner-only via private fc_members table keyed by auth.uid().
--             Anonymous users denied. Authenticated non-members denied.
-- ============================================================================

-- ============================================================================
-- 1. FINANCIAL CENTER MEMBERSHIP TABLE (authoritative access control)
--    RLS on every FC table checks: EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid())
--    To enroll Phil and Crystal, after their Supabase Auth accounts exist:
--      INSERT INTO fc_members (user_id) VALUES ('<phil-uuid>'), ('<crystal-uuid>');
--    Find UUIDs: Supabase Dashboard → Authentication → Users → copy UID column.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fc_members (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'owner',
  added_by  uuid REFERENCES auth.users(id),
  added_at  timestamptz NOT NULL DEFAULT now()
);

-- Only members can see the membership list
ALTER TABLE fc_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read fc_members" ON fc_members;
CREATE POLICY "Members can read fc_members" ON fc_members
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members m WHERE m.user_id = auth.uid()));

-- Insertions into fc_members require an existing member to add new members.
-- The initial Phil and Crystal rows must be inserted by a Supabase admin
-- using the dashboard SQL Editor (which runs as service_role, bypassing RLS).
DROP POLICY IF EXISTS "Members can insert fc_members" ON fc_members;
CREATE POLICY "Members can insert fc_members" ON fc_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM fc_members m WHERE m.user_id = auth.uid())
  );

-- ============================================================================
-- 2. IMPORT HISTORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_history (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  filename        text NOT NULL,
  file_hash       text,
  import_date     timestamptz NOT NULL DEFAULT now(),
  account_id      bigint,
  profile_id      bigint,
  total_rows      integer DEFAULT 0,
  new_count       integer DEFAULT 0,
  duplicate_count integer DEFAULT 0,
  error_count     integer DEFAULT 0,
  review_required_count integer DEFAULT 0,
  status          text DEFAULT 'completed'
);

-- ============================================================================
-- 3. IMPORT PROFILES TABLE
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

-- ============================================================================
-- 4. TRANSACTIONS SCHEMA EXTENSIONS (columns that may already exist)
-- ============================================================================

-- Add fingerprint column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'fingerprint'
  ) THEN
    ALTER TABLE transactions ADD COLUMN fingerprint text;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trans_fingerprint ON transactions(fingerprint);
  END IF;
END $$;

-- Add import_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'import_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN import_id bigint;
    CREATE INDEX IF NOT EXISTS idx_trans_import_id ON transactions(import_id);
  END IF;
END $$;

-- Existing indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_trans_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_trans_review ON transactions(review_status);
CREATE INDEX IF NOT EXISTS idx_trans_fingerprint ON transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_trans_import_id ON transactions(import_id);

CREATE INDEX IF NOT EXISTS idx_import_history_account ON import_history(account_id);
CREATE INDEX IF NOT EXISTS idx_import_history_date ON import_history(import_date DESC);

-- ============================================================================
-- 5. ROW-LEVEL SECURITY — EVERY FINANCIAL CENTER TABLE
--    Pattern: EXIST (SELECT 1 FROM fc_members WHERE user_id = auth.uid())
--    Anonymous visitors → auth.uid() is null → returns false → denied
--    Authenticated non-members → no row in fc_members → returns false → denied
--    Members (Phil, Crystal) → row exists → returns true → allowed
-- ============================================================================

-- accounts
ALTER TABLE IF EXISTS accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select accounts" ON accounts;
CREATE POLICY "FC members can select accounts" ON accounts
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert accounts" ON accounts;
CREATE POLICY "FC members can insert accounts" ON accounts
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update accounts" ON accounts;
CREATE POLICY "FC members can update accounts" ON accounts
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete accounts" ON accounts;
CREATE POLICY "FC members can delete accounts" ON accounts
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- categories
ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select categories" ON categories;
CREATE POLICY "FC members can select categories" ON categories
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert categories" ON categories;
CREATE POLICY "FC members can insert categories" ON categories
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update categories" ON categories;
CREATE POLICY "FC members can update categories" ON categories
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete categories" ON categories;
CREATE POLICY "FC members can delete categories" ON categories
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- subcategories
ALTER TABLE IF EXISTS subcategories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select subcategories" ON subcategories;
CREATE POLICY "FC members can select subcategories" ON subcategories
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert subcategories" ON subcategories;
CREATE POLICY "FC members can insert subcategories" ON subcategories
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update subcategories" ON subcategories;
CREATE POLICY "FC members can update subcategories" ON subcategories
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete subcategories" ON subcategories;
CREATE POLICY "FC members can delete subcategories" ON subcategories
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- transactions
ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select transactions" ON transactions;
CREATE POLICY "FC members can select transactions" ON transactions
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert transactions" ON transactions;
CREATE POLICY "FC members can insert transactions" ON transactions
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update transactions" ON transactions;
CREATE POLICY "FC members can update transactions" ON transactions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete transactions" ON transactions;
CREATE POLICY "FC members can delete transactions" ON transactions
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- merchant_memory
ALTER TABLE IF EXISTS merchant_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select merchant_memory" ON merchant_memory;
CREATE POLICY "FC members can select merchant_memory" ON merchant_memory
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert merchant_memory" ON merchant_memory;
CREATE POLICY "FC members can insert merchant_memory" ON merchant_memory
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update merchant_memory" ON merchant_memory;
CREATE POLICY "FC members can update merchant_memory" ON merchant_memory
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete merchant_memory" ON merchant_memory;
CREATE POLICY "FC members can delete merchant_memory" ON merchant_memory
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- scheduled_transactions
ALTER TABLE IF EXISTS scheduled_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select scheduled_transactions" ON scheduled_transactions;
CREATE POLICY "FC members can select scheduled_transactions" ON scheduled_transactions
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert scheduled_transactions" ON scheduled_transactions;
CREATE POLICY "FC members can insert scheduled_transactions" ON scheduled_transactions
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update scheduled_transactions" ON scheduled_transactions;
CREATE POLICY "FC members can update scheduled_transactions" ON scheduled_transactions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete scheduled_transactions" ON scheduled_transactions;
CREATE POLICY "FC members can delete scheduled_transactions" ON scheduled_transactions
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- transaction_splits
ALTER TABLE IF EXISTS transaction_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select transaction_splits" ON transaction_splits;
CREATE POLICY "FC members can select transaction_splits" ON transaction_splits
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert transaction_splits" ON transaction_splits;
CREATE POLICY "FC members can insert transaction_splits" ON transaction_splits
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update transaction_splits" ON transaction_splits;
CREATE POLICY "FC members can update transaction_splits" ON transaction_splits
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete transaction_splits" ON transaction_splits;
CREATE POLICY "FC members can delete transaction_splits" ON transaction_splits
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- transaction_attachments
ALTER TABLE IF EXISTS transaction_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select transaction_attachments" ON transaction_attachments;
CREATE POLICY "FC members can select transaction_attachments" ON transaction_attachments
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert transaction_attachments" ON transaction_attachments;
CREATE POLICY "FC members can insert transaction_attachments" ON transaction_attachments
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update transaction_attachments" ON transaction_attachments;
CREATE POLICY "FC members can update transaction_attachments" ON transaction_attachments
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete transaction_attachments" ON transaction_attachments;
CREATE POLICY "FC members can delete transaction_attachments" ON transaction_attachments
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- reconciliations
ALTER TABLE IF EXISTS reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select reconciliations" ON reconciliations;
CREATE POLICY "FC members can select reconciliations" ON reconciliations
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert reconciliations" ON reconciliations;
CREATE POLICY "FC members can insert reconciliations" ON reconciliations
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update reconciliations" ON reconciliations;
CREATE POLICY "FC members can update reconciliations" ON reconciliations
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete reconciliations" ON reconciliations;
CREATE POLICY "FC members can delete reconciliations" ON reconciliations
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- import_history (new table, above)
ALTER TABLE IF EXISTS import_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select import_history" ON import_history;
CREATE POLICY "FC members can select import_history" ON import_history
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert import_history" ON import_history;
CREATE POLICY "FC members can insert import_history" ON import_history
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update import_history" ON import_history;
CREATE POLICY "FC members can update import_history" ON import_history
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete import_history" ON import_history;
CREATE POLICY "FC members can delete import_history" ON import_history
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- import_profiles (new table, above)
ALTER TABLE IF EXISTS import_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FC members can select import_profiles" ON import_profiles;
CREATE POLICY "FC members can select import_profiles" ON import_profiles
  FOR SELECT USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can insert import_profiles" ON import_profiles;
CREATE POLICY "FC members can insert import_profiles" ON import_profiles
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can update import_profiles" ON import_profiles;
CREATE POLICY "FC members can update import_profiles" ON import_profiles
  FOR UPDATE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "FC members can delete import_profiles" ON import_profiles;
CREATE POLICY "FC members can delete import_profiles" ON import_profiles
  FOR DELETE USING (EXISTS (SELECT 1 FROM fc_members WHERE user_id = auth.uid()));

-- fc_members (new table, above) RLS already set

-- ============================================================================
-- 6. ENROLLMENT STEPS (run manually in Supabase SQL Editor)
-- ============================================================================
--
-- After Phil and Crystal have authenticated at least once (creating their
-- auth.users records), find their UUIDs in:
--   Supabase Dashboard → Authentication → Users
--
-- Then run:
--   INSERT INTO fc_members (user_id)
--   VALUES
--     ('<phil-auth-uid>'),
--     ('<crystal-auth-uid>');
--
-- The INSERT policy on fc_members allows this to run with service_role
-- or via the dashboard SQL Editor.

-- ============================================================================
-- 7. VERIFICATION QUERIES (run after migration + enrollment to confirm)
-- ============================================================================
--
-- List all RLS-enabled tables:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = true
--   ORDER BY tablename;
--
-- List all FC policies:
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN (
--       'accounts','categories','subcategories','transactions','merchant_memory',
--       'scheduled_transactions','transaction_splits','transaction_attachments',
--       'reconciliations','import_history','import_profiles','fc_members'
--     )
--   ORDER BY tablename, cmd;
