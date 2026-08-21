# Production Deployment Dry-Run Report

## Project: Gathering Moss Financial Center
## Date: 2026-08-21
## Source commit: `dffced2` (recovery/financial-center-stabilization)

---

## 1. Live Schema Inventory

### Financial Center — Existing Tables

| Table | Rows | Status |
|:------|-----:|:-------|
| `accounts` | 3 | Checking ($754.82), Savings ($0), Cash ($0). All opening_balance = $0. |
| `categories` | 9 | Plants, 3D Printing, Shipping, Software, Meals, Office, Income, Transfer, Personal |
| `subcategories` | 1 | "Plant and Product Sales" (under Income) |
| `transactions` | 26 | 14 unique + 12 duplicates. All account_id=1. All empty fingerprint. All null import_id. All approved. |
| `merchant_memory` | 0 | Empty |
| `scheduled_transactions` | 0 | Empty |
| `transaction_splits` | 0 | Empty |
| `transaction_attachments` | 0 | Empty |
| `reconciliations` | 0 | Empty |

### Financial Center — Missing Tables

| Table | Created by migration? |
|:------|:---------------------:|
| `import_history` | Yes |
| `import_profiles` | Yes |
| `fc_members` | Yes |

### Skrybix Tables

| Table | Status | Migration impact |
|:------|:-------|:-----------------|
| `marketplace_brand_profiles` | Exists, 0 rows | None |

---

## 2. Duplicate Transaction Analysis

12 transactions are exact duplicates (same date, payee, amount):

| Original ID | Duplicate ID | Date | Payee | Amount |
|:-----------:|:-----------:|:-----|:------|-------:|
| 50 | 64 | 2026-08-18 | SP+AFF * WEST3D PRINTI | -$27.11 |
| 51 | 65 | 2026-08-18 | InstPmntIn STP FBO 08/18 | $110.70 |
| 52 | 66 | 2026-08-18 | Plant Identification, Milpitas CA | $48.07 |
| 53 | 67 | 2026-08-17 | SHOPIFY CAPITAL | -$14.71 |
| 54 | 68 | 2026-08-17 | ANTHROPIC* CLAUDE SUB | -$20.00 |
| 55 | 69 | 2026-08-17 | Afterpay | -$27.11 |
| 56 | 70 | 2026-08-17 | ONLINE TRANSFER FROM | $4.00 |
| 57 | 71 | 2026-08-17 | InstPmntIn STP FBO 08/17 5Y6H8 | $195.56 |
| 58 | 72 | 2026-08-17 | InstPmntIn STP FBO 08/17 5Y6H8 | $45.56 |
| 59 | 73 | 2026-08-17 | InstPmntIn STP FBO 08/17 5Y6H8 | $68.89 |
| 60 | 74 | 2026-08-17 | SHOPIFY GATHERIN TRANSFER | $55.06 |
| 61 | 75 | 2026-08-17 | OVERDRAFT ITEM FEE | -$36.00 |

**Recommendation:** Run dry-run deletion proposal as a separate pass. Do not remove yet.

---

## 3. Fingerprint Safety Audit

Current state: `transactions.fingerprint` is **empty** (null) for all 26 rows.

```
SELECT count(*) FROM transactions WHERE fingerprint IS NOT NULL → 0
```

The migration's duplicate audit will find 0 duplicates and successfully add the unique constraint.

**No blocker.** Migration can proceed.

---

## 4. Migration Objects Summary

Objects created by `001_enable_rls_financial_center.sql`:

| Type | Object | Idempotent? |
|:-----|:-------|:-----------:|
| Table | `fc_members` | `CREATE TABLE IF NOT EXISTS` |
| Table | `import_history` | `CREATE TABLE IF NOT EXISTS` |
| Table | `import_profiles` | `CREATE TABLE IF NOT EXISTS` |
| Column | `transactions.fingerprint` | `ADD COLUMN IF NOT EXISTS` |
| Column | `transactions.import_id` | `ADD COLUMN IF NOT EXISTS` |
| Constraint | `uq_trans_fingerprint` | `DROP IF EXISTS` + `ADD` |
| Constraint | `fk_import_history_account_id` | `DROP IF EXISTS` + `ADD` |
| Constraint | `fk_import_history_profile_id` | `DROP IF EXISTS` + `ADD` |
| Constraint | `fk_transactions_import_id` | `DROP IF EXISTS` + `ADD` |
| Index | `idx_trans_account_date` | `CREATE IF NOT EXISTS` |
| Index | `idx_trans_fingerprint` | `CREATE IF NOT EXISTS` |
| Index | `idx_trans_import_id` | `CREATE IF NOT EXISTS` |
| Index | `idx_import_history_account` | `CREATE IF NOT EXISTS` |
| Index | `idx_import_history_date` | `CREATE IF NOT EXISTS` |
| Function | `fc_import_transactions(bigint,text,jsonb)` | `CREATE OR REPLACE` |
| Policy | 45 RLS policies (12 tables x 4 ops minus fc_members INSERT/UPDATE/DELETE) | `DROP IF EXISTS` + `CREATE` |

**No Skrybix objects referenced.**

---

## 5. Authorization State

### Current (no RLS, no migration applied)
- **anon key**: Full read access to all FC tables (no RLS)
- **No `fc_members` table**: No ownership tracking
- **No auth enforcement**: Any visitor can read financial data

### After Migration (with RLS + policies)
- **anon**: Zero access to any FC table (no policies match anon role and `TO authenticated` excludes)
- **Authenticated non-member**: Zero access (fc_members EXISTS check fails)
- **Phil/Crystal**: Full CRUD access once enrolled in fc_members
- **fc_members**: Read-own-row only via `user_id = auth.uid()` — no browser INSERT/UPDATE/DELETE

---

## 6. Enrollment Steps

After migration:

1. Confirm Phil and Crystal have `auth.users` entries in Supabase.
2. Find their UUIDs in Supabase Dashboard → Authentication → Users.
3. Run in SQL Editor:
   ```sql
   INSERT INTO fc_members (user_id, role) VALUES ('<phil-uuid>', 'owner');
   INSERT INTO fc_members (user_id, role) VALUES ('<crystal-uuid>', 'owner');
   ```
4. Verify: Login as Phil → should see accounts. Login as anonymous → should see nothing.

---

## 7. Backup and Rollback

### Pre-migration backup
```bash
# Client-side JSON snapshot (via app)
# Or: export all FC tables via Supabase dashboard
```

### Rollback procedure
If the migration causes issues:
1. `DROP TABLE IF EXISTS fc_members, import_history, import_profiles CASCADE;`
2. `ALTER TABLE transactions DROP COLUMN IF EXISTS fingerprint, DROP COLUMN IF EXISTS import_id;`
3. `DROP FUNCTION IF EXISTS fc_import_transactions;`
4. `DROP POLICY IF EXISTS ... ON accounts/transactions/etc;` for all FC tables
5. `ALTER TABLE accounts/categories/etc DISABLE ROW LEVEL SECURITY;`
6. Restore from pre-migration JSON backup if data was affected.

---

## 8. Pre-deployment Blockers

| Blocker | Severity | Resolution |
|:--------|:---------|:-----------|
| Account opening balances = $0 | **Critical** | Must be restored from owner knowledge or bank statements. Migration does NOT set these. |
| 12 duplicate transactions | **Medium** | Blockers for accurate reporting. Separate cleanup pass after migration. |
| 0 merchant_memory rules | **Medium** | Import auto-categorization won't work. Seed rules after migration. |
| 1 subcategory vs 30+ in seed | **Medium** | Seed subcategories after migration. |
| Auth user existence unconfirmed | **High** | Phil and Crystal must have auth.users entries before enrollment. |
| Anonymous currently reads all data | **Critical** | Migration addresses this. Apply ASAP. |
| No pre-migration backup | **High** | Take JSON snapshot before applying migration. |

---

## 9. Post-deployment Verification Checklist

- [ ] `SELECT count(*) FROM import_history` → succeeds (table exists)
- [ ] `SELECT count(*) FROM import_profiles` → succeeds (table exists)
- [ ] `SELECT count(*) FROM fc_members` → succeeds (table exists)
- [ ] Anonymous `GET /rest/v1/accounts` → returns `[]` or 401
- [ ] Phil authenticated `GET /rest/v1/accounts` → returns 3 rows
- [ ] Crystal authenticated `GET /rest/v1/accounts` → returns 3 rows
- [ ] Phil `POST /rest/v1/fc_members` with valid UUID → permission denied
- [ ] `pg_get_serial_sequence('import_history', 'id')` → returns sequence name
- [ ] `SELECT fingerprint FROM transactions LIMIT 1` → returns null (column exists, no crash)
- [ ] Import PNC CSV → creates import_history row, inserts transactions with fingerprints
- [ ] Re-import same CSV → 0 new transactions, correct duplicate count
