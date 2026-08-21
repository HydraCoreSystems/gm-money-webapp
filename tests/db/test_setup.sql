-- ================================================================
-- Database Test Setup: Minimal auth schema so RLS can be tested
-- against real PostgreSQL without requiring the full Supabase stack.
-- ================================================================

-- Create auth schema and users table (Supabase-compatible minimal mock)
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE,
  raw_user_meta_data jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

-- auth.uid(): returns the user ID from the current session context.
-- In tests we set this via: SELECT set_config('fc_test.user_id', 'uuid', TRUE);
-- In production Supabase sets 'request.jwt.claim.sub' automatically.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
DECLARE
  sub text;
BEGIN
  -- Try the production Supabase GUC first, then fall back to test GUC
  sub := NULLIF(current_setting('request.jwt.claim.sub', TRUE), '');
  IF sub IS NULL THEN
    sub := NULLIF(current_setting('fc_test.user_id', TRUE), '');
  END IF;
  IF sub IS NULL THEN RETURN NULL; END IF;
  RETURN sub::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$ LANGUAGE plpgsql STABLE;

-- auth.role(): returns 'authenticated' when a valid JWT sub is present.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN RETURN 'authenticated'; END IF;
  RETURN 'anon';
END $$ LANGUAGE plpgsql STABLE;

-- Pre-populate test users (IDs are deterministic for testing)
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'phil@gatheringmoss.com'),
  ('22222222-2222-2222-2222-222222222222', 'crystal@gatheringmoss.com'),
  ('99999999-9999-9999-9999-999999999999', 'stranger@outsider.com')
ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- Create roles early (tables and grants reference them below)
-- ================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fc_test_role') THEN
    CREATE ROLE fc_test_role WITH LOGIN PASSWORD 'testpass';
  END IF;
END $$;

GRANT authenticated TO fc_test_role;

-- ================================================================
-- Create minimal FC tables that match the production skrybix schema.
-- These are the tables the migration expects to be present.
-- ================================================================

CREATE TABLE IF NOT EXISTS accounts (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name            text NOT NULL,
  institution     text,
  type            text NOT NULL,
  opening_balance numeric(12,2) DEFAULT 0,
  current_balance numeric(12,2) DEFAULT 0,
  active          boolean DEFAULT true,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name            text NOT NULL,
  type            text NOT NULL,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcategories (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  category_id     bigint,
  name            text NOT NULL,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id                    bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  account_id            bigint,
  date                  date NOT NULL,
  posted_date           date,
  payee                 text NOT NULL,
  original_description  text,
  amount                numeric(12,2) NOT NULL,
  transaction_type      text NOT NULL,
  category_id           bigint,
  subcategory_id        bigint,
  memo                  text,
  payment_method        text,
  reference_num         text,
  cleared_status        text DEFAULT 'uncleared',
  review_status         text DEFAULT 'approved',
  transfer_account_id   bigint,
  transfer_transaction_id bigint,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_memory (
  id                    bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  normalized_merchant   text NOT NULL,
  match_pattern         text NOT NULL,
  match_type            text DEFAULT 'contains',
  display_payee         text NOT NULL,
  category_id           bigint,
  subcategory_id        bigint,
  confidence            numeric(3,2) DEFAULT 1.0,
  times_seen            integer DEFAULT 1,
  last_seen             timestamptz DEFAULT now(),
  last_confirmed        timestamptz DEFAULT now(),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_transactions (
  id                    bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  payee                 text NOT NULL,
  amount                numeric(12,2) NOT NULL,
  account_id            bigint,
  transaction_type      text NOT NULL,
  category_id           bigint,
  subcategory_id        bigint,
  payment_method        text,
  frequency             text NOT NULL,
  next_due_date         text NOT NULL,
  auto_create           integer DEFAULT 0,
  active                integer DEFAULT 1,
  memo                  text,
  last_generated_date   text,
  created_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_splits (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  transaction_id  bigint,
  category_id     bigint,
  subcategory_id  bigint,
  amount          numeric(12,2) NOT NULL,
  memo            text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_attachments (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  transaction_id  bigint,
  filename        text NOT NULL,
  original_name   text NOT NULL,
  mime_type       text,
  file_size       integer,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliations (
  id                    bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  account_id            bigint,
  statement_date        text NOT NULL,
  statement_balance     numeric(12,2) NOT NULL,
  cleared_balance       numeric(12,2) NOT NULL,
  difference            numeric(12,2) NOT NULL,
  status                text DEFAULT 'completed',
  completed_at          timestamptz DEFAULT now()
);

-- Seed test accounts matching production (1 checking, 1 savings, 1 cash)
INSERT INTO accounts (name, institution, type, opening_balance, current_balance)
VALUES
  ('Gathering Moss Business Checking', 'PNC Bank', 'checking', 2500.00, 2500.00),
  ('Business Savings & Reserve', 'PNC Bank', 'savings', 0.00, 0.00),
  ('Cash on Hand', 'Local', 'cash', 0.00, 0.00)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, type) VALUES
  ('Plants', 'expense'),
  ('3D Printing', 'expense'),
  ('Shipping', 'expense'),
  ('Software', 'expense'),
  ('Income', 'income')
ON CONFLICT DO NOTHING;

-- ================================================================
-- Unrelated Skrybix control table (to prove migration does not touch it)
-- ================================================================

CREATE TABLE IF NOT EXISTS skrybix_control (
  id        bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  label     text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Give it distinctive grants that must survive the migration unchanged
GRANT SELECT ON skrybix_control TO PUBLIC;
GRANT INSERT, UPDATE, DELETE ON skrybix_control TO authenticated;

-- ================================================================
-- fc_test_role grants: schema access and broad table privileges for RLS testing
-- ================================================================

GRANT USAGE ON SCHEMA public TO fc_test_role;
GRANT USAGE ON SCHEMA auth TO fc_test_role;
GRANT SELECT ON auth.users TO fc_test_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO fc_test_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO fc_test_role;
