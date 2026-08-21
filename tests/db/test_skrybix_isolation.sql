-- ================================================================
-- Skrybix Isolation Regression Test (self-contained)
-- 1. Captures baseline of skrybix_control table + its identity sequence
-- 2. Applies the FC migration once, compares baseline → asserts unchanged
-- 3. Applies the FC migration again, compares baseline → asserts unchanged
-- 4. Verifies FC tables received their grants
-- ================================================================

\set ON_ERROR_STOP on

\echo '========================================'
\echo '  SKRYBIX ISOLATION REGRESSION TEST'
\echo '========================================'

-- ================================================================
-- Step 1: Store pre-migration baseline in a persistent table
-- ================================================================
\echo ''
\echo '--- Step 1: Capture pre-migration baseline ---'

DROP TABLE IF EXISTS _skrybix_baseline;

CREATE TABLE _skrybix_baseline (
  entity_type  text NOT NULL,
  entity_name  text NOT NULL,
  grantee      text NOT NULL,
  privilege    text NOT NULL
);

-- Capture sequence grants
INSERT INTO _skrybix_baseline (entity_type, entity_name, grantee, privilege)
SELECT 'sequence', c.relname, g.rolname, priv
FROM pg_class c
CROSS JOIN LATERAL (
  SELECT (aclexplode(c.relacl)).grantee AS grantee_oid,
         (aclexplode(c.relacl)).privilege_type AS priv
) acl
JOIN pg_roles g ON g.oid = acl.grantee_oid
WHERE c.relkind = 'S'
  AND c.relname LIKE '%skrybix_control%';

-- Capture table grants
INSERT INTO _skrybix_baseline (entity_type, entity_name, grantee, privilege)
SELECT 'table', 'skrybix_control', g.rolname, priv
FROM pg_class c
CROSS JOIN LATERAL (
  SELECT (aclexplode(c.relacl)).grantee AS grantee_oid,
         (aclexplode(c.relacl)).privilege_type AS priv
) acl
JOIN pg_roles g ON g.oid = acl.grantee_oid
WHERE c.relname = 'skrybix_control' AND c.relkind = 'r';

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM _skrybix_baseline;
  IF cnt > 0 THEN
    RAISE NOTICE 'Baseline captured: % grants on skrybix_control table and sequence', cnt;
  ELSE
    RAISE EXCEPTION 'FAIL: no baseline grants captured — skrybix_control may not exist';
  END IF;
END $$;

-- ================================================================
-- Step 2: Apply the FC migration (pass 1)
-- ================================================================
\echo ''
\echo '--- Step 2: Apply migration pass 1 ---'

-- Use a psql include to apply the migration
-- The migration file path is set by the caller via --set=FC_MIGRATION='path'

\i :FC_MIGRATION

-- ================================================================
-- Step 3: Compare post-migration grants against baseline
-- ================================================================
\echo ''
\echo '--- Step 3: Verify grants unchanged after pass 1 ---'

--- Capture current grants
CREATE TEMP TABLE _current_grants AS
SELECT 'sequence' AS entity_type, c.relname AS entity_name, g.rolname AS grantee, priv AS privilege
FROM pg_class c
CROSS JOIN LATERAL (
  SELECT (aclexplode(c.relacl)).grantee AS grantee_oid,
         (aclexplode(c.relacl)).privilege_type AS priv
) acl
JOIN pg_roles g ON g.oid = acl.grantee_oid
WHERE c.relkind = 'S' AND c.relname LIKE '%skrybix_control%'
UNION ALL
SELECT 'table', 'skrybix_control', g.rolname, priv
FROM pg_class c
CROSS JOIN LATERAL (
  SELECT (aclexplode(c.relacl)).grantee AS grantee_oid,
         (aclexplode(c.relacl)).privilege_type AS priv
) acl
JOIN pg_roles g ON g.oid = acl.grantee_oid
WHERE c.relname = 'skrybix_control' AND c.relkind = 'r'
;

DO $$
DECLARE
  missing_count integer;
  extra_count   integer;
  r record;
BEGIN
  -- Any baseline grant missing in current
  SELECT count(*) INTO missing_count FROM _skrybix_baseline b
  WHERE NOT EXISTS (
    SELECT 1 FROM _current_grants c
    WHERE c.entity_type = b.entity_type
      AND c.entity_name = b.entity_name
      AND c.grantee = b.grantee
      AND c.privilege = b.privilege
  );

  -- Any current grant not in baseline
  SELECT count(*) INTO extra_count FROM _current_grants c
  WHERE NOT EXISTS (
    SELECT 1 FROM _skrybix_baseline b
    WHERE b.entity_type = c.entity_type
      AND b.entity_name = c.entity_name
      AND b.grantee = c.grantee
      AND b.privilege = c.privilege
  );

  IF missing_count = 0 AND extra_count = 0 THEN
    RAISE NOTICE 'PASS: pass 1 — all % baseline grants preserved, no extras', (SELECT count(*) FROM _skrybix_baseline);
  ELSE
    IF missing_count > 0 THEN
      RAISE WARNING '% baseline grants removed by migration pass 1:', missing_count;
      FOR r IN
        SELECT b.* FROM _skrybix_baseline b
        WHERE NOT EXISTS (
          SELECT 1 FROM _current_grants c
          WHERE c.entity_type = b.entity_type AND c.entity_name = b.entity_name
            AND c.grantee = b.grantee AND c.privilege = b.privilege
        )
      LOOP
        RAISE WARNING '  LOST: % % — grantee=%, privilege=%', r.entity_type, r.entity_name, r.grantee, r.privilege;
      END LOOP;
    END IF;
    IF extra_count > 0 THEN
      RAISE WARNING '% unexpected grants added by migration pass 1:', extra_count;
      FOR r IN
        SELECT c.* FROM _current_grants c
        WHERE NOT EXISTS (
          SELECT 1 FROM _skrybix_baseline b
          WHERE b.entity_type = c.entity_type AND b.entity_name = c.entity_name
            AND b.grantee = c.grantee AND b.privilege = c.privilege
        )
      LOOP
        RAISE WARNING '  ADDED: % % — grantee=%, privilege=%', r.entity_type, r.entity_name, r.grantee, r.privilege;
      END LOOP;
    END IF;
    RAISE EXCEPTION 'FAIL: pass 1 — % grants lost, % grants added', missing_count, extra_count;
  END IF;
END $$;

DROP TABLE IF EXISTS _current_grants;

-- ================================================================
-- Step 4: Apply the FC migration (pass 2)
-- ================================================================
\echo ''
\echo '--- Step 4: Apply migration pass 2 ---'

\i :FC_MIGRATION

-- ================================================================
-- Step 5: Compare again after pass 2
-- ================================================================
\echo ''
\echo '--- Step 5: Verify grants unchanged after pass 2 ---'

CREATE TEMP TABLE _current_grants2 AS
SELECT 'sequence' AS entity_type, c.relname AS entity_name, g.rolname AS grantee, priv AS privilege
FROM pg_class c
CROSS JOIN LATERAL (
  SELECT (aclexplode(c.relacl)).grantee AS grantee_oid,
         (aclexplode(c.relacl)).privilege_type AS priv
) acl
JOIN pg_roles g ON g.oid = acl.grantee_oid
WHERE c.relkind = 'S' AND c.relname LIKE '%skrybix_control%'
UNION ALL
SELECT 'table', 'skrybix_control', g.rolname, priv
FROM pg_class c
CROSS JOIN LATERAL (
  SELECT (aclexplode(c.relacl)).grantee AS grantee_oid,
         (aclexplode(c.relacl)).privilege_type AS priv
) acl
JOIN pg_roles g ON g.oid = acl.grantee_oid
WHERE c.relname = 'skrybix_control' AND c.relkind = 'r'
;

DO $$
DECLARE
  missing_count integer;
  extra_count   integer;
BEGIN
  SELECT count(*) INTO missing_count FROM _skrybix_baseline b
  WHERE NOT EXISTS (SELECT 1 FROM _current_grants2 c
    WHERE c.entity_type = b.entity_type AND c.entity_name = b.entity_name
      AND c.grantee = b.grantee AND c.privilege = b.privilege);

  SELECT count(*) INTO extra_count FROM _current_grants2 c
  WHERE NOT EXISTS (SELECT 1 FROM _skrybix_baseline b
    WHERE b.entity_type = c.entity_type AND b.entity_name = c.entity_name
      AND b.grantee = c.grantee AND b.privilege = c.privilege);

  IF missing_count = 0 AND extra_count = 0 THEN
    RAISE NOTICE 'PASS: pass 2 — all % baseline grants preserved, no extras', (SELECT count(*) FROM _skrybix_baseline);
  ELSE
    RAISE EXCEPTION 'FAIL: pass 2 — % grants lost, % grants added', missing_count, extra_count;
  END IF;
END $$;

DROP TABLE IF EXISTS _current_grants2;

-- ================================================================
-- Step 6: Verify FC tables received their grants
-- ================================================================
\echo ''
\echo '--- Step 6: FC tables have authenticated grants ---'

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
    WHERE table_schema = 'public' AND table_name = tbl
      AND grantee = 'authenticated' AND privilege_type = 'SELECT';
    IF cnt = 0 THEN
      RAISE EXCEPTION 'FAIL: authenticated has no SELECT on %', tbl;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: all FC tables have authenticated SELECT';
END $$;

-- ================================================================
-- Cleanup
-- ================================================================
DROP TABLE IF EXISTS _skrybix_baseline;

\echo ''
\echo '========================================'
\echo '  SKRYBIX ISOLATION TEST COMPLETED'
\echo '========================================'
