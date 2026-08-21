# Production Safeguards — Requirements Mapping

## 1. Atomic Owner Enrollment
- **Implementation**: `deploy/src/enroll.sql` — INSERT both owners in same transaction as reset/migration
- **Preflight validation**: `deploy/src/preflight.sql` — validates UUIDs exist in auth.users, rejects placeholders
- **Verification**: `deploy/src/verify.sql` — asserts exactly 2 fc_members rows, both owners confirmed
- **Rollback test**: `tests/db/test_rollback.sql` Test 4 — enrollment failure after Phil (before Crystal) rolls back entirely
- **Never commits without both owners**: verify phase aborts with EXCEPTION if either missing

## 2. Deterministically Generated Deployment
- **Generator**: PowerShell script regenerates `deploy/production-reset.sql` from canonical sources
- **Sources**: `deploy/src/preflight.sql`, `deploy/src/clear.sql`, `supabase/migrations/001_enable_rls_financial_center.sql`, `deploy/src/enroll.sql`, `deploy/src/verify.sql`
- **Freshness test**: `tests/test_freshness.js` — fails if any source mtime > generated file mtime
- **No manual copy**: generated file contains "GENERATED FILE — do not edit directly" header

## 3. Account Preservation
- **Preflight**: `deploy/src/preflight.sql` — requires exactly 3 accounts (1 checking, 1 savings, 1 cash, no extras)
- **Capture**: `_pre_reset_accounts` temp table captures all fields before reset
- **Verification**: `deploy/src/verify.sql` — iterates all 3 accounts, confirms IDs/names/types match pre-reset
- **Cash account**: Preserved exactly. Balance remains "Not yet established." Does not block deployment.

## 4. Transactional Data Clear
- **Implementation**: `deploy/src/clear.sql` — DELETE FROM transaction_attachments, transaction_splits, reconciliations, import_history, transactions
- **Verification**: `deploy/src/verify.sql` — asserts all 5 tables = 0, zero fingerprints, zero import references
- **Test**: `tests/db/test_production_reset.sql` — 28 simulated transactions cleared to zero

## 5. Backup and Restoration
- **Backup**: `deploy/backup.sql` — creates `fc_backup` schema with accounts, categories, subcategories, transactions, splits, attachments, reconciliations, import_history, merchant_memory, scheduled_transactions, grants
- **Verification**: backup counts confirmed before COMMIT
- **Restoration**: documented inline in backup.sql — INSERT from fc_backup.* tables

## 6. Unrelated Objects Untouched
- **Isolation test**: `tests/db/test_skrybix_isolation.sql` — captures baseline of skrybix_control grants, applies migration twice, confirms all 22 grants unchanged (including PUBLIC)
- **Migration**: never uses schema-wide grants, only targets FC tables by name

## 7. Rollback Tests
- **Test 1**: Preflight failure (invalid UUID) — 28 transactions preserved
- **Test 2**: Clear phase failure — all data intact
- **Test 3**: Migration failure — test table rolled back
- **Test 4**: Enrollment failure (Phil only, not Crystal) — zero fc_members rows
- **Test 5**: Verification detects uncleared data
- **Test 6**: Non-destructive success checks

## 8. Access Control
- **Anonymous denied**: Auth tests — SELECT on accounts returns 0 rows, INSERT denied
- **Non-member denied**: Auth tests — stranger sees 0 accounts, 0 fc_members rows
- **Phil access**: Auth tests — SELECT/INSERT/UPDATE/DELETE on transactions, sees fc_members row
- **Crystal access**: Auth tests — SELECT/INSERT/DELETE on transactions
- **Cannot add members**: Auth tests — both Phil and Crystal denied INSERT on fc_members
- **Service role enrollment**: Auth tests — table owner can INSERT into fc_members

## 9. Balance Establishment (Dynamic)
- **NULL = not established**: `accounts.opening_balance` DROP NOT NULL
- **Reset sets NULL**: `deploy/src/clear.sql` — `UPDATE accounts SET opening_balance = NULL`
- **RPC**: requires `p_statement_balance` on first import, rejects on subsequent imports
- **Client**: `api.js` detects `balance_established`, passes `statementBalance`
- **UI**: `importer.js` shows balance initialization screen with calculation preview
- **Tests**: `tests/db/test_balance_establishment.sql` — 6 scenarios

## 10. UI/Client Tests
- **"Not yet established" display**: sidebar shows "Not established" when `balance_established === false`
- **First-import prompt**: importer detects unestablished account, shows balance entry form
- **Calculation preview**: shows net amount, opening balance, resulting balance
- **Cancellation**: cancel button returns to upload form, nothing written
- **Confirmation**: commitImport passes statementBalance to api.processImport
- **Subsequent imports**: no balance prompt when account balance is established
- **Reimport idempotent**: duplicate fingerprints → 0 new, opening unchanged
- **Cash uninitialized**: preserved in "Not established" state, does not block Checking imports
