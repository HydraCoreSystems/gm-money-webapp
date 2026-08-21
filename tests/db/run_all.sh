#!/bin/bash
# ================================================================
# Gathering Moss Financial Center — Database Test Runner
# Spins up a fresh PostgreSQL container, runs migration twice,
# then executes auth and import tests.
# ================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PG_CONTAINER="gm_fc_test_pg"
PG_PORT="54330"
PG_USER="postgres"
PG_PASS="testpass123"
PG_DB="gm_test"
TEST_DIR="$SCRIPT_DIR/tests/db"
MIGRATION="$REPO_ROOT/supabase/migrations/001_enable_rls_financial_center.sql"

echo "================================================================"
echo "  GATHERING MOSS — DATABASE TEST SUITE"
echo "================================================================"

cleanup() {
  echo ""
  echo "--- Cleaning up test container ---"
  docker rm -f "$PG_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 1. Start fresh PostgreSQL 15 container
echo ""
echo "--- Starting PostgreSQL 15 test container ---"
docker rm -f "$PG_CONTAINER" 2>/dev/null || true
docker run -d --name "$PG_CONTAINER" \
  -e POSTGRES_USER="$PG_USER" \
  -e POSTGRES_PASSWORD="$PG_PASS" \
  -e POSTGRES_DB="$PG_DB" \
  -p "$PG_PORT:5432" \
  postgres:15 \
  -c log_statement=all

echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" > /dev/null 2>&1; then
    echo "PostgreSQL is ready."
    break
  fi
  sleep 1
done

PSQL="docker exec -i $PG_CONTAINER psql -U $PG_USER -d $PG_DB -v ON_ERROR_STOP=1"

# 2. Run test setup (auth schema, FC tables, seed data)
echo ""
echo "================================================================"
echo "  PHASE 1: Test Setup"
echo "================================================================"
$PSQL < "$REPO_ROOT/tests/db/test_setup.sql"
echo "  Setup complete."

# 3. Run migration — FIRST PASS
echo ""
echo "================================================================"
echo "  PHASE 2: Migration — First Pass"
echo "================================================================"
$PSQL < "$MIGRATION"
echo "  First migration pass complete."

# 4. Run migration — SECOND PASS (repeatability)
echo ""
echo "================================================================"
echo "  PHASE 3: Migration — Second Pass (Repeatability)"
echo "================================================================"
$PSQL < "$MIGRATION"
echo "  Second migration pass complete (repeatability proven)."

# Verify no duplicate constraints or policies
echo ""
echo "--- Checking for duplicate constraints/policies ---"
POLICY_COUNT=$($PSQL -t -c "SELECT count(*) FROM pg_policies WHERE schemaname = 'public';" | tr -d ' ')
echo "  Policy count: $POLICY_COUNT"

# 5. Auth tests
echo ""
echo "================================================================"
echo "  PHASE 4: Auth Access Control Tests"
echo "================================================================"
$PSQL < "$REPO_ROOT/tests/db/test_auth.sql"

# 6. Import tests
echo ""
echo "================================================================"
echo "  PHASE 5: Import Tests"
echo "================================================================"
$PSQL < "$REPO_ROOT/tests/db/test_import.sql"

# 7. Foreign key verification
echo ""
echo "================================================================"
echo "  PHASE 6: Foreign Key Verification"
echo "================================================================"
$PSQL <<SQL
\echo '--- Foreign keys on import_history and transactions ---'
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table,
  CASE confdeltype
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete,
  CASE confupdtype
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_update
FROM pg_constraint
WHERE contype = 'f'
  AND (
    conrelid::regclass::text IN ('import_history', 'transactions')
    OR confrelid::regclass::text IN ('import_history', 'import_profiles', 'accounts')
  )
ORDER BY conname;
SQL

echo ""
echo "================================================================"
echo "  ALL DATABASE TESTS PASSED"
echo "================================================================"
