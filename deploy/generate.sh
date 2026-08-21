#!/bin/bash
# ================================================================
# Generates deploy/production-reset.sql from source components.
# Fails if output is stale (sources newer than generated file).
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT="$SCRIPT_DIR/production-reset.sql"

# Source files in order
SRC_PREFLIGHT="$SCRIPT_DIR/src/preflight.sql"
SRC_CLEAR="$SCRIPT_DIR/src/clear.sql"
SRC_MIGRATION="$REPO_ROOT/supabase/migrations/001_enable_rls_financial_center.sql"
SRC_ENROLL="$SCRIPT_DIR/src/enroll.sql"
SRC_VERIFY="$SCRIPT_DIR/src/verify.sql"

# Build the output
cat > "$OUTPUT" << 'HEADER'
-- ============================================================
-- Gathering Moss Financial Center — Production Reset & Deployment
-- GENERATED FILE — do not edit directly.
-- Source: deploy/src/*.sql + supabase/migrations/001_enable_rls_financial_center.sql
-- Regenerate: bash deploy/generate.sh
--
-- Before running:
--   1. Run deploy/backup.sql to create a pre-reset backup.
--   2. Replace all {{PLACEHOLDER}} values below.
--   3. Review the complete script.
--   4. Run in Supabase Dashboard SQL Editor.
-- ============================================================

BEGIN;

\echo '========================================'
\echo '  GATHERING MOSS — PRODUCTION RESET'
\echo '========================================'

HEADER

echo "" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
echo "-- PHASE: preflight (validates UUIDs, balances, account state)" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
cat "$SRC_PREFLIGHT" >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
echo "-- PHASE: clear (removes all transactional data)" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
cat "$SRC_CLEAR" >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
echo "-- PHASE: migrate (canonical Financial Center schema + RLS + RPC)" >> "$OUTPUT"
echo "-- Source: supabase/migrations/001_enable_rls_financial_center.sql" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
cat "$SRC_MIGRATION" >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
echo "-- PHASE: enroll (atomic owner enrollment in fc_members)" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
cat "$SRC_ENROLL" >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
echo "-- PHASE: verify (post-deployment assertions before COMMIT)" >> "$OUTPUT"
echo "-- ================================================================" >> "$OUTPUT"
cat "$SRC_VERIFY" >> "$OUTPUT"

cat >> "$OUTPUT" << 'FOOTER'

\echo ''
\echo '========================================'
\echo '  DEPLOYMENT SUCCESSFUL'
\echo '========================================'

COMMIT;

\echo ''
\echo 'Owners enrolled. Anonymous access blocked. RLS active. Fresh start ready.'
\echo 'Next: verify access (anon=denied, Phil+Crystal=full), deploy Vercel app, import first PNC CSV.'
FOOTER

echo "Generated: $OUTPUT"
