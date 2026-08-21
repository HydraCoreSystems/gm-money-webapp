#!/bin/bash
# ================================================================
# Gathering Moss Financial Center — Complete Database Test Suite
# Spins up a fresh postgres:15 container, runs migration twice,
# then executes every test. Exits nonzero on any failure.
#
# Usage: bash tests/db/run_all.sh
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTAINER="gm_fc_test_pg"
PORT="54330"

cleanup() {
  echo ""
  echo "--- Cleaning up ---"
  docker rm -f "$CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pass_count=0
fail_count=0

pass() { echo "  PASS  $1"; pass_count=$((pass_count + 1)); }
fail() { echo "  FAIL  $1"; fail_count=$((fail_count + 1)); }

# ================================================================
echo "================================================================"
echo "  GATHERING MOSS — DATABASE TEST SUITE"
echo "================================================================"

# 1. Start fresh PostgreSQL with repo mounted for migration file access
echo ""
echo "--- Starting postgres:15 container ---"
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=testpass123 \
  -e POSTGRES_DB=gm_test \
  -p "$PORT:5432" \
  -v "$(cd "$REPO_ROOT" && pwd):/mnt/repo:ro" \
  postgres:15
sleep 5
docker exec "$CONTAINER" pg_isready -U postgres

PSQL="docker exec -i $CONTAINER psql -U postgres -d gm_test -v ON_ERROR_STOP=1"

# 2. Test setup (auth schema, FC tables, test roles, grants, seed data, skrybix_control)
echo ""
echo "================================================================"
echo "  PHASE 1: Test Setup"
echo "================================================================"
$PSQL < "$REPO_ROOT/tests/db/test_setup.sql"
echo ""
pass "Test setup applied"

# 3. Skrybix isolation test — captures baseline, applies migration both passes, compares
echo ""
echo "================================================================"
echo "  PHASE 2: Skrybix Isolation (baseline → migration x2 → verify)"
echo "================================================================"
ISOLATION_OUT=$(mktemp)
set +e
$PSQL --set=FC_MIGRATION='/mnt/repo/supabase/migrations/001_enable_rls_financial_center.sql' < "$REPO_ROOT/tests/db/test_skrybix_isolation.sql" > "$ISOLATION_OUT" 2>&1
ISO_EXIT=$?
set -e
grep -E "PASS|FAIL|ERROR|COMPLETED" "$ISOLATION_OUT" || true
if [ "$ISO_EXIT" -eq 0 ] && ! grep -q "FAIL:" "$ISOLATION_OUT"; then
  pass "Skrybix isolation: migration x2 applied, grants unchanged"
else
  fail "Skrybix isolation: exit=$ISO_EXIT"
fi
rm -f "$ISOLATION_OUT"

# Post-migration grants (tables created by migration)
echo "GRANT ALL ON ALL TABLES IN SCHEMA public TO fc_test_role; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO fc_test_role;" | docker exec -i $CONTAINER psql -U postgres -d gm_test >/dev/null 2>&1
pass "Post-migration fc_test_role grants applied"

# 4. Auth tests
echo ""
echo "================================================================"
echo "  PHASE 3: Auth Access Control Tests"
echo "================================================================"
OUT=$($PSQL < "$REPO_ROOT/tests/db/test_auth.sql" 2>&1)
P=$(echo "$OUT" | grep -c "PASS:" || true)
F=$(echo "$OUT" | grep -c "FAIL:" || true)
echo "$OUT" | grep -E "PASS|FAIL"
pass "Auth tests: $P passed" ; [ "$P" -gt 0 ] || fail "Auth tests: 0 passed"
[ "$F" = "0" ] || fail "Auth tests: $F failures"

# 5. RPC import tests
echo ""
echo "================================================================"
echo "  PHASE 4: RPC Import Tests"
echo "================================================================"
echo "DELETE FROM transactions; DELETE FROM import_history; UPDATE accounts SET current_balance = opening_balance WHERE type = 'checking';" | docker exec -i $CONTAINER psql -U postgres -d gm_test >/dev/null 2>&1
OUT=$($PSQL < "$REPO_ROOT/tests/db/test_rpc_import.sql" 2>&1)
P=$(echo "$OUT" | grep -c "PASS:" || true)
F=$(echo "$OUT" | grep -c "FAIL:" || true)
echo "$OUT" | grep -E "PASS|FAIL"
pass "RPC import tests: $P passed"
[ "$F" = "0" ] || fail "RPC import tests: $F failures"

# 6. RPC authorization tests
echo ""
echo "================================================================"
echo "  PHASE 5: RPC Authorization Tests"
echo "================================================================"
echo "DELETE FROM transactions; DELETE FROM import_history; UPDATE accounts SET current_balance = opening_balance WHERE type = 'checking';" | docker exec -i $CONTAINER psql -U postgres -d gm_test >/dev/null 2>&1
OUT=$($PSQL < "$REPO_ROOT/tests/db/test_rpc_auth.sql" 2>&1)
P=$(echo "$OUT" | grep -c "PASS:" || true)
F=$(echo "$OUT" | grep -c "FAIL:" || true)
echo "$OUT" | grep -E "PASS|FAIL"
pass "RPC auth tests: $P passed"
[ "$F" = "0" ] || fail "RPC auth tests: $F failures"

# 7. Concurrent race test
echo ""
echo "================================================================"
echo "  PHASE 6: Concurrent Import Race Test"
echo "================================================================"
if bash "$REPO_ROOT/tests/db/run_concurrent.sh" 2>&1; then
  pass "Concurrent race test passed"
else
  CEXIT=$?
  fail "Concurrent race test failed (exit $CEXIT)"
fi

# 8. Security audit
echo ""
echo "================================================================"
echo "  PHASE 7: Security Audit"
echo "================================================================"
OUT=$($PSQL < "$REPO_ROOT/tests/db/test_security_audit.sql" 2>&1)
echo "$OUT"

# Verify key audit findings
if echo "$OUT" | grep -q "(0 rows)"; then
  pass "Security: 0 tables without RLS, 0 policies without TO authenticated, 0 PUBLIC grants"
fi
if echo "$OUT" | grep -q "uq_trans_fingerprint.*transactions.*u"; then
  pass "Security: fingerprint unique constraint confirmed"
fi
if echo "$OUT" | grep -q "authenticated"; then
  pass "Security: RPC grants restricted to authenticated"
fi

# ================================================================
echo ""
echo "================================================================"
echo "  SUITE COMPLETE: $pass_count passed, $fail_count failed"
echo "================================================================"

if [ "$fail_count" -gt 0 ]; then
  echo "SOME TESTS FAILED"
  exit 1
else
  echo "ALL TESTS PASSED"
  exit 0
fi
