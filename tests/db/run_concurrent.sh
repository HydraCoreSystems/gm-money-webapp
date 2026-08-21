#!/bin/bash
# ================================================================
# True Concurrent Import Test — two simultaneous RPC sessions
# Uses FOR UPDATE account-row lock for serialization.
# Both sessions fire RPC calls in parallel; the lock guarantees
# exactly one set of inserts wins and the second session sees duplicates.
# Exits nonzero on any failure.
# ================================================================

set -euo pipefail

CONTAINER="gm_fc_test_pg"
PSQL="docker exec -i $CONTAINER psql -U postgres -d gm_test -v ON_ERROR_STOP=1 -t -A"

RESULT_DIR=$(mktemp -d)
trap "rm -rf $RESULT_DIR" EXIT

echo "=== CONCURRENT IMPORT RACE TEST ==="

# Clean state
echo "Resetting test data..."
echo "DELETE FROM transactions; DELETE FROM import_history; UPDATE accounts SET current_balance = opening_balance WHERE type = 'checking';" | docker exec -i $CONTAINER psql -U postgres -d gm_test >/dev/null 2>&1

ACC_ID=$($PSQL -c "SELECT id FROM accounts WHERE type = 'checking' LIMIT 1;")
if [ -z "$ACC_ID" ]; then echo "FAIL: no account"; exit 1; fi
echo "Account ID: $ACC_ID"

# Import payload: same JSON for both sessions
PAYLOAD='[{"date":"2026-08-23","payee":"ConcA1","amount":-10,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|1"},{"date":"2026-08-23","payee":"ConcA2","amount":-20,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|2"},{"date":"2026-08-23","payee":"ConcA3","amount":-30,"transaction_type":"expense","suggested_category_id":1,"confidence":0.95,"fingerprint":"fp-conc-real|3"}]'

# Both sessions call the RPC simultaneously.
# The FOR UPDATE lock serializes them — one inserts, the other sees ON CONFLICT duplicates.
run_session() {
  local SESSION_ID=$1
  local SESSION_SET="11111111-1111-1111-1111-111111111111"  # Phil

  echo "SELECT set_config('fc_test.user_id', '$SESSION_SET', FALSE); SET ROLE fc_test_role; SELECT fc_import_transactions($ACC_ID, 'concurrent_real.csv', '$PAYLOAD'::jsonb);" \
    | docker exec -i $CONTAINER psql -U postgres -d gm_test -t -A > "$RESULT_DIR/session_${SESSION_ID}.txt" 2>&1
  echo $? > "$RESULT_DIR/session_${SESSION_ID}.exit"
}

echo "Firing both sessions simultaneously..."
run_session 1 &
PID1=$!
run_session 2 &
PID2=$!

# Wait for both
wait $PID1
EXIT1=$(cat "$RESULT_DIR/session_1.exit")
wait $PID2
EXIT2=$(cat "$RESULT_DIR/session_2.exit")

echo ""
echo "--- Session 1 output ---"
cat "$RESULT_DIR/session_1.txt"
echo "--- Session 2 output ---"
cat "$RESULT_DIR/session_2.txt"

# Check both sessions exited cleanly
if [ "$EXIT1" != "0" ]; then echo "FAIL: Session 1 exited with code $EXIT1"; exit 1; fi
if [ "$EXIT2" != "0" ]; then echo "FAIL: Session 2 exited with code $EXIT2"; exit 1; fi

# Parse results
S1_IMPORTED=$(grep -o '"imported_count":[[:space:]]*[0-9]*' "$RESULT_DIR/session_1.txt" | head -1 | grep -o '[0-9]*' || echo "0")
S1_DUPS=$(grep -o '"duplicate_count":[[:space:]]*[0-9]*' "$RESULT_DIR/session_1.txt" | head -1 | grep -o '[0-9]*' || echo "0")
S2_IMPORTED=$(grep -o '"imported_count":[[:space:]]*[0-9]*' "$RESULT_DIR/session_2.txt" | head -1 | grep -o '[0-9]*' || echo "0")
S2_DUPS=$(grep -o '"duplicate_count":[[:space:]]*[0-9]*' "$RESULT_DIR/session_2.txt" | head -1 | grep -o '[0-9]*' || echo "0")

# One session imported 3, the other saw 3 duplicates (ON CONFLICT)
TOTAL_IMPORTED=$((S1_IMPORTED + S2_IMPORTED))
TOTAL_DUPS=$((S1_DUPS + S2_DUPS))

echo ""
if [ "$TOTAL_IMPORTED" = "3" ] && [ "$TOTAL_DUPS" = "3" ]; then
  echo "PASS: exactly 3 imported + 3 duplicates (one session won, one saw conflicts)"
else
  echo "FAIL: $TOTAL_IMPORTED imported + $TOTAL_DUPS duplicates (expected 3+3)"
  exit 1
fi

# Verify database state
TOTAL_ROWS=$($PSQL -c "SELECT count(*) FROM transactions;")
UNIQUE_FP=$($PSQL -c "SELECT count(DISTINCT fingerprint) FROM transactions WHERE fingerprint IS NOT NULL;")
IN_PROGRESS=$($PSQL -c "SELECT count(*) FROM import_history WHERE status = 'in_progress';")
BALANCE=$($PSQL -c "SELECT current_balance FROM accounts WHERE id = $ACC_ID;")

echo "DB state: $TOTAL_ROWS rows, $UNIQUE_FP unique fingerprints, $IN_PROGRESS in_progress history, balance=$BALANCE"

if [ "$TOTAL_ROWS" != "$UNIQUE_FP" ]; then
  echo "FAIL: row count ($TOTAL_ROWS) != unique fingerprints ($UNIQUE_FP)"
  exit 1
fi

if [ "$IN_PROGRESS" != "0" ]; then
  echo "FAIL: $IN_PROGRESS in_progress history rows remain"
  exit 1
fi

# Retry: importing again should produce 0 new rows
echo ""
echo "--- Retry after both sessions ---"
RETRY_OUT=$($PSQL -c "SELECT set_config('fc_test.user_id', '11111111-1111-1111-1111-111111111111', FALSE); SET ROLE fc_test_role; SELECT fc_import_transactions($ACC_ID, 'retry.csv', '$PAYLOAD'::jsonb);")
RETRY_DUPS=$(echo "$RETRY_OUT" | grep -o '"duplicate_count":[[:space:]]*[0-9]*' | grep -o '[0-9]*' || echo "0")
if [ "$RETRY_DUPS" = "3" ]; then
  echo "PASS: retry after both sessions saw 3 duplicates (idempotent)"
else
  echo "FAIL: retry had $RETRY_DUPS duplicates (expected 3)"
  exit 1
fi

echo ""
echo "=== CONCURRENT IMPORT RACE TEST PASSED ==="
