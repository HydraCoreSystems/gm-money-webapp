-- ================================================================
-- Supabase/PostgreSQL Security Audit for Gathering Moss Financial Center
-- Checks: public functions, RLS gaps, policy gaps, public grants, search_path
-- ================================================================

\echo '========================================'
\echo '  FINANCIAL CENTER SECURITY AUDIT'
\echo '========================================'

-- ================================================================
-- Check 1: Functions accessible to PUBLIC (should be none for FC)
-- ================================================================
\echo ''
\echo '--- 1. Public functions ---'

SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  (regexp_matches(p.proacl::text, '([^=]+)=', 'g'))[1] AS granted_to
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname LIKE 'fc_%'
ORDER BY p.proname;

-- ================================================================
-- Check 2: Tables without RLS enabled in public schema
-- ================================================================
\echo ''
\echo '--- 2. Tables without RLS ---'

SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
  AND tablename IN (
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles','fc_members'
  )
ORDER BY tablename;

-- ================================================================
-- Check 3: Policies NOT restricted TO authenticated
-- ================================================================
\echo ''
\echo '--- 3. Policies without TO authenticated ---'

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND NOT (roles @> ARRAY['authenticated']::name[])
  AND tablename IN (
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles','fc_members'
  )
ORDER BY tablename, cmd;

-- ================================================================
-- Check 4: Tables with INSERT/UPDATE/DELETE policies that allow PUBLIC
-- ================================================================
\echo ''
\echo '--- 4. Policies granting PUBLIC ---'

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (roles @> ARRAY['public']::name[] OR roles IS NULL OR roles = '{}'::name[])
ORDER BY tablename, cmd;

-- ================================================================
-- Check 5: Default privileges on public schema
-- ================================================================
\echo ''
\echo '--- 5. Default privileges ---'

SELECT
  defaclobjtype,
  defaclacl::text AS default_acl
FROM pg_default_acl
WHERE defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ================================================================
-- Check 6: Unique constraint on transactions.fingerprint
-- ================================================================
\echo ''
\echo '--- 6. Fingerprint constraint ---'

SELECT
  conname,
  conrelid::regclass AS table_name,
  contype
FROM pg_constraint
WHERE conrelid = 'transactions'::regclass
  AND (conname LIKE '%fingerprint%' OR conname LIKE '%uq_trans%');

-- ================================================================
-- Check 7: Functions with PRIVILEGES to PUBLIC
-- ================================================================
\echo ''
\echo '--- 7. Functions executable by PUBLIC ---'

SELECT
  proname,
  (regexp_matches(proacl::text, '([^=]+)=', 'g'))[1] AS execute_grant
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proacl IS NOT NULL
  AND proname LIKE 'fc_%'
ORDER BY proname;

-- ================================================================
-- Summary
-- ================================================================
\echo ''
\echo '========================================'
\echo '  SECURITY AUDIT COMPLETE'
\echo '========================================'
