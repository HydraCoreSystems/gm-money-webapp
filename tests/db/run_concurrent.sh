#!/bin/bash
# ================================================================
# True Concurrent Import Test Runner
# Uses pg_advisory_lock to synchronize two independent psql sessions.
# Session 1 imports first, Session 2 waits for lock release, then re-imports.
# ================================================================

set -e

CONTAINER="gm_fc_test_pg"
PSQL="docker exec -i $CONTAINER psql -U postgres -d gm_test -v ON_ERROR_STOP=1"

echo "=== CONCURRENT IMPORT RACE TEST ==="

# Clean up any old lock
$PSQL -c "SELECT pg_advisory_unlock(99999);" 2>/dev/null || true

# Acquire the lock first — both sessions will wait on it
$PSQL -c "SELECT pg_advisory_lock(99999);" &
LOCK_PID=$!
sleep 0.5

# Session 2: will wait for lock, then re-import
(
  echo "SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);"
  echo "SET ROLE fc_test_role;"
  echo "SELECT pg_advisory_lock(99999);  -- wait for session 1 to finish"
  echo "SELECT fc_import_transactions("
  echo "  (SELECT id FROM accounts WHERE type = 'checking' LIMIT 1),"
  echo "  'concurrent_real.csv',"
  echo "  '[\"fp-conc-real|1\",\"fp-conc-real|2\",\"fp-conc-real|3\"]'::jsonb"
  echo ") AS s2_result;"
  echo "SELECT pg_advisory_unlock(99999);"
) | docker exec -i $CONTAINER psql -U postgres -d gm_test -t > /tmp/s2_output.txt 2>&1 &
S2_PID=$!
sleep 0.5

# Session 1: first import (has the lock — wait briefly then release after import)
(
  echo "SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE);"
  echo "SET ROLE fc_test_role;"
  echo "SELECT fc_import_transactions("
  echo "  (SELECT id FROM accounts WHERE type = 'checking' LIMIT 1),"
  echo "  'concurrent_real.csv',"
  echo "  '["
  echo "    {\"date\":\"2026-08-23\",\"payee\":\"ConcA1\",\"amount\":-10,\"transaction_type\":\"expense\",\"suggested_category_id\":1,\"confidence\":0.95,\"fingerprint\":\"fp-conc-real|1\"},"
  echo "    {\"date\":\"2026-08-23\",\"payee\":\"ConcA2\",\"amount\":-20,\"transaction_type\":\"expense\",\"suggested_category_id\":1,\"confidence\":0.95,\"fingerprint\":\"fp-conc-real|2\"},"
  echo "    {\"date\":\"2026-08-23\",\"payee\":\"ConcA3\",\"amount\":-30,\"transaction_type\":\"expense\",\"suggested_category_id\":1,\"confidence\":0.95,\"fingerprint\":\"fp-conc-real|3\"}"
  echo "  ]'::jsonb"
  echo ") AS s1_result;"
  echo "SELECT pg_advisory_unlock(99999);"
) | docker exec -i $CONTAINER psql -U postgres -d gm_test -t > /tmp/s1_output.txt 2>&1 &
S1_PID=$!

# Wait for both sessions
wait $S1_PID 2>/dev/null || true
wait $S2_PID 2>/dev/null || true
wait $LOCK_PID 2>/dev/null || true

echo ""
echo "--- Session 1 output ---"
cat /tmp/s1_output.txt 2>/dev/null || echo "(empty)"
echo ""
echo "--- Session 2 output ---"
cat /tmp/s2_output.txt 2>/dev/null || echo "(empty)"

# Verify: Session 1 imported 3, Session 2 saw 3 duplicates
S1_IMPORTED=$(grep -o '"imported_count": [0-9]*' /tmp/s1_output.txt 2>/dev/null | head -1 | awk '{print $2}' || echo "?")
S2_DUPS=$(grep -o '"duplicate_count": [0-9]*' /tmp/s2_output.txt 2>/dev/null | head -1 | awk '{print $2}' || echo "?")

echo ""
if [ "$S1_IMPORTED" = "3" ]; then
  echo "PASS: Session 1 imported 3 ($S1_IMPORTED)"
else
  echo "FAIL: Session 1 imported $S1_IMPORTED (expected 3)"
fi

if [ "$S2_DUPS" = "3" ]; then
  echo "PASS: Session 2 saw 3 duplicates ($S2_DUPS)"
else
  echo "FAIL: Session 2 had $S2_DUPS duplicates (expected 3)"
fi

echo ""
echo "=== CONCURRENT TEST COMPLETE ==="
