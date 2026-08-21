# Post-Deployment Verification Checklist

## Pre-Deployment (before running reset)

- [ ] JSON backup of all FC tables downloaded (use app Backup button or Dashboard export)
- [ ] Phil and Crystal's Supabase Auth UUIDs confirmed
- [ ] Owner-supplied opening balances for Checking, Savings, Cash confirmed
- [ ] `deploy/production-reset.sql` reviewed and UUIDs/balances inserted
- [ ] No active user sessions during deployment window

## Deployment Execution

- [ ] Run `deploy/production-reset.sql` in Supabase Dashboard SQL Editor
- [ ] Confirm output shows "DEPLOYMENT SUCCESSFUL" and COMMIT
- [ ] Run enrollment SQL: `INSERT INTO fc_members (user_id, role) VALUES ...`

## Row Count Verification

| Table | Expected | Actual | Pass? |
|:------|:---------|:-------|:-----:|
| `accounts` | 3 | ___ | [ ] |
| `categories` | 9 | ___ | [ ] |
| `subcategories` | 1 | ___ | [ ] |
| `transactions` | 0 | ___ | [ ] |
| `transaction_splits` | 0 | ___ | [ ] |
| `transaction_attachments` | 0 | ___ | [ ] |
| `reconciliations` | 0 | ___ | [ ] |
| `import_history` | 0 | ___ | [ ] |
| `merchant_memory` | 0 | ___ | [ ] |
| `scheduled_transactions` | 0 | ___ | [ ] |
| `fc_members` | 2 | ___ | [ ] |

## Account Preservation

| Account | Type | Opening Balance | Current Balance | Pass? |
|:--------|:-----|:----------------|:----------------|:-----:|
| Checking | checking | ___ | ___ | [ ] |
| Savings | savings | ___ | ___ | [ ] |
| Cash | cash | ___ | ___ | [ ] |

## Authentication and RLS

- [ ] Anonymous browser: `GET /rest/v1/accounts` → `[]` or 401
- [ ] Anonymous browser: `GET /rest/v1/transactions` → `[]` or 401
- [ ] Login as Phil → can see accounts
- [ ] Login as Crystal → can see accounts
- [ ] Phil tries `INSERT INTO fc_members` via browser → denied
- [ ] Crystal tries `INSERT INTO fc_members` via browser → denied
- [ ] `SELECT * FROM fc_members` as Phil → sees own row only

## First PNC CSV Import

- [ ] App loads, login works, Dashboard shows zero transactions
- [ ] Navigate to CSV Import
- [ ] Select Checking account
- [ ] Upload fresh PNC CSV
- [ ] Preview shows correct rows with expected dedup count
- [ ] Commit import
- [ ] Transactions appear in Register with correct running balances

## Import Atomicity

- [ ] Re-import same CSV → 0 new transactions, all detected as duplicates
- [ ] Import CSV with one invalid fingerprint → entire import rolls back, nothing persisted
- [ ] Retry after rollback → import succeeds

## Reports / Register

- [ ] Register shows running balances for all transactions
- [ ] Account balance matches (opening + approved transaction net)
- [ ] Review Queue shows low-confidence items
- [ ] Dashboard MTD/Net Worth reflects imported data

## Security

- [ ] 12 FC tables have RLS enabled
- [ ] 45 RLS policies exist (4 per table × 11 tables + 1 on fc_members)
- [ ] `fc_import_transactions` only executable by authenticated
- [ ] `marketplace_brand_profiles` (Skrybix) untouched
- [ ] No broad grants on public schema sequences

## Rollback (if needed)

- [ ] JSON backup imported successfully
- [ ] Application returns to pre-reset state
