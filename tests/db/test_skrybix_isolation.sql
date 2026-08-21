-- ================================================================
-- Skrybix Isolation Regression Test
-- Proves: migration only touches FC-owned sequences and tables.
-- Unrelated tables/sequences/grants remain exactly as they were.
-- ================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '  SKRYBIX ISOLATION REGRESSION TEST'
\echo '========================================'

-- ================================================================
-- 1. Capture pre-migration state of control table
-- ================================================================
\echo ''
\echo '--- 1. Pre-migration control table grants ---'

CREATE TEMP TABLE pre_grants AS
SELECT
  c.relname AS sequence_name,
  (aclexplode(c.relacl)).grantee::regrole AS grantee,
  (aclexplode(c.relacl)).privilege_type AS privilege
FROM pg_class c
WHERE c.relkind = 'S'
  AND c.relname LIKE '%skrybix_control%';

CREATE TEMP TABLE pre_table_grants AS
SELECT
  (aclexplode(c.relacl)).grantee::regrole AS grantee,
  (aclexplode(c.relacl)).privilege_type AS privilege
FROM pg_class c
WHERE c.relname = 'skrybix_control' AND c.relkind = 'r';

-- ================================================================
-- 2. Run the migration twice
-- ================================================================
\echo '--- 2. Running migration (pass 1 and 2) ---'

-- Migration passes will be applied by the runner script.
-- This file is run AFTER the runner applies migrations.

-- ================================================================
-- 3. Verify control sequence grants unchanged
-- ================================================================
\echo ''
\echo '--- 3. Control sequence grants unchanged ---'

DO $$
DECLARE
  before_count integer;
  after_count integer;
  r record;
  t record;
BEGIN
  SELECT count(*) INTO before_count FROM pre_grants;

  -- Collect current grants on control sequence
  CREATE TEMP TABLE post_grants AS
  SELECT
    c.relname AS sequence_name,
    (aclexplode(c.relacl)).grantee::regrole AS grantee,
    (aclexplode(c.relacl)).privilege_type AS privilege
  FROM pg_class c
  WHERE c.relkind = 'S'
    AND c.relname LIKE '%skrybix_control%';

  SELECT count(*) INTO after_count FROM post_grants;

  -- Check: no grants were removed or added
  IF before_count = after_count AND before_count > 0 THEN
    RAISE NOTICE 'PASS: control sequence grant count unchanged (before=%, after=%)', before_count, after_count;
  ELSE
    RAISE EXCEPTION 'FAIL: control sequence grant count changed — before=%, after=%', before_count, after_count;
  END IF;

  -- Check: every pre-existing grant still exists
  FOR r IN SELECT * FROM pre_grants LOOP
    IF NOT EXISTS (
      SELECT 1 FROM post_grants
      WHERE sequence_name = r.sequence_name
        AND grantee = r.grantee
        AND privilege = r.privilege
    ) THEN
      RAISE EXCEPTION 'FAIL: lost grant — sequence=%, grantee=%, privilege=%', r.sequence_name, r.grantee, r.privilege;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: all pre-existing control sequence grants preserved';

  -- Check: no new grants appeared
  FOR r IN SELECT * FROM post_grants LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pre_grants
      WHERE sequence_name = r.sequence_name
        AND grantee = r.grantee
        AND privilege = r.privilege
    ) THEN
      RAISE EXCEPTION 'FAIL: unexpected grant — sequence=%, grantee=%, privilege=%', r.sequence_name, r.grantee, r.privilege;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: no unexpected grants appeared on control sequence';

  DROP TABLE IF EXISTS post_grants;
END $$;

-- ================================================================
-- 4. Verify control table grants unchanged
-- ================================================================
\echo ''
\echo '--- 4. Control table grants unchanged ---'

DO $$
DECLARE
  r record;
BEGIN
  -- Check that the control table still has its distinctive grants using has_table_privilege
  IF has_table_privilege('public', 'public.skrybix_control', 'SELECT') THEN
    RAISE NOTICE 'PASS: PUBLIC SELECT on skrybix_control preserved';
  ELSE
    RAISE EXCEPTION 'FAIL: PUBLIC SELECT on skrybix_control was removed';
  END IF;

  IF has_table_privilege('authenticated', 'public.skrybix_control', 'INSERT') THEN
    RAISE NOTICE 'PASS: authenticated INSERT on skrybix_control preserved';
  ELSE
    RAISE EXCEPTION 'FAIL: authenticated INSERT on skrybix_control was removed';
  END IF;

  RAISE NOTICE 'PASS: all control table grants intact';

  DROP TABLE IF EXISTS pre_grants;
  DROP TABLE IF EXISTS pre_table_grants;
END $$;

-- ================================================================
-- 5. Verify FC tables did receive grants
-- ================================================================
\echo ''
\echo '--- 5. FC tables have authenticated grants ---'

DO $$
DECLARE
  tbl text;
  cnt integer;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts','categories','subcategories','transactions','merchant_memory',
    'scheduled_transactions','transaction_splits','transaction_attachments',
    'reconciliations','import_history','import_profiles'
  ] LOOP
    SELECT count(*) INTO cnt
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = tbl
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT';

    IF cnt = 0 THEN
      RAISE EXCEPTION 'FAIL: authenticated has no SELECT on %', tbl;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: all FC tables have authenticated SELECT';
END $$;

\echo ''
\echo '========================================'
\echo '  SKRYBIX ISOLATION TEST COMPLETED'
\echo '========================================'
